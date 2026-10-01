/** Server-only MAL adapter: throttling, token refresh, normalization and public caching. */
export class AppError extends Error {
  constructor(message, status = 400, code = "request_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const fields =
  "mean,num_scoring_users,rating,alternative_titles,synopsis,genres,num_episodes,media_type,start_season,start_date,status,average_episode_duration,studios,nsfw,related_anime,recommendations";
export function validImage(raw) {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      ["cdn.myanimelist.net", "api-cdn.myanimelist.net"].includes(u.hostname) &&
      !u.port &&
      !u.username &&
      !u.password &&
      /^\/images\/anime\/[\w/.-]+\.(jpg|jpeg|png|webp)$/i.test(u.pathname) &&
      !u.search
    );
  } catch {
    return false;
  }
}
/** Give the frontend a stable, small model instead of exposing raw API responses. */
export function normalize(node) {
  return {
    id: node.id,
    title: node.alternative_titles?.en || node.title,
    originalTitle: node.title,
    image: node.main_picture?.large || node.main_picture?.medium || "",
    synopsis: node.synopsis || "",
    genres: (node.genres || []).map((g) => g.name),
    episodes: node.num_episodes || 0,
    format: node.media_type || "unknown",
    year:
      node.start_season?.year ||
      (node.start_date ? Number(node.start_date.slice(0, 4)) : null),
    duration: Math.round((node.average_episode_duration || 0) / 60),
    status: node.status || "",
    score: Number.isFinite(node.mean) && node.mean > 0 ? node.mean : null,
    scoreVotes: Number.isInteger(node.num_scoring_users)
      ? node.num_scoring_users
      : null,
    ageRating: node.rating || "",
    studios: (node.studios || []).map((s) => s.name),
    nsfw: node.nsfw || "unknown",
    prequels: (node.related_anime || [])
      .filter((r) => r.relation_type === "prequel")
      .map((r) => r.node.id),
    recommendations: (node.recommendations || []).map((r) => r.node.id),
    listStatus: node.my_list_status || undefined,
  };
}
export function createMalClient({
  clientId,
  clientSecret,
  fetcher = fetch,
  interval = 700,
}) {
  let tail = Promise.resolve(),
    nextAt = 0;
  const cache = new Map();
  // A promise queue spaces requests even when several routes call MAL concurrently.
  async function scheduled(task) {
    const pending = tail.then(async () => {
      const delay = nextAt - Date.now();
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      try {
        return await task();
      } finally {
        nextAt = Math.max(nextAt, Date.now() + interval);
      }
    });
    tail = pending.catch(() => {});
    return pending;
  }
  async function token(form) {
    let r;
    try {
      r = await fetcher("https://myanimelist.net/v1/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          ...form,
        }),
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      });
    } catch {
      throw new AppError(
        "Could not reach MyAnimeList. Please try connecting again.",
        502,
      );
    }
    if (!r.ok)
      throw new AppError(
        "MyAnimeList could not authorize this connection. Check your credentials and redirect URL.",
        401,
        "auth_failed",
      );
    const t = await r.json();
    if (!t.access_token || !t.refresh_token)
      throw new AppError(
        "MyAnimeList returned an incomplete authorization response.",
        502,
      );
    return {
      access: t.access_token,
      refresh: t.refresh_token,
      expires: Date.now() + (Number(t.expires_in) || 3600) * 1000,
    };
  }
  // Reuse an in-flight refresh so concurrent requests cannot rotate tokens twice.
  async function access(session) {
    if (!session?.tokens) return null;
    if (session.tokens.expires > Date.now() + 60000)
      return session.tokens.access;
    if (!session.refreshing)
      session.refreshing = token({
        grant_type: "refresh_token",
        refresh_token: session.tokens.refresh,
      })
        .then((t) => (session.tokens = t))
        .catch((e) => {
          delete session.tokens;
          throw e;
        })
        .finally(() => delete session.refreshing);
    return (await session.refreshing).access;
  }
  async function request(
    path,
    { session, method = "GET", body, publicCache = false } = {},
  ) {
    if (!clientId)
      throw new AppError(
        "Add your MAL Client ID to .env, then restart Anime Shuffle.",
        503,
        "not_configured",
      );
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new AppError("Invalid API path.");
    // Never cache account-specific responses, even if a caller requests public caching.
    const canCache = publicCache && !session && method === "GET";
    if (canCache && cache.get(path)?.expires > Date.now())
      return cache.get(path).data;
    return scheduled(async () => {
      const a = await access(session);
      const headers = a
        ? { Authorization: `Bearer ${a}` }
        : { "X-MAL-CLIENT-ID": clientId };
      if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
      let r;
      try {
        r = await fetcher("https://api.myanimelist.net/v2" + path, {
          method,
          headers,
          body: body ? new URLSearchParams(body) : undefined,
          signal: AbortSignal.timeout(20000),
          redirect: "error",
        });
      } catch {
        throw new AppError(
          "MyAnimeList could not be reached. Try again in a moment.",
          502,
        );
      }
      if (r.status === 429) {
        nextAt =
          Date.now() +
          Math.min(
            120,
            Math.max(10, Number(r.headers.get("retry-after")) || 30),
          ) *
            1000;
        throw new AppError(
          "MyAnimeList is limiting requests. Wait a moment before trying again.",
          429,
        );
      }
      if (r.status === 401) {
        if (session) delete session.tokens;
        throw new AppError(
          "Your MAL connection expired. Connect again in Settings.",
          401,
          "auth_expired",
        );
      }
      if (!r.ok)
        throw new AppError(
          r.status === 403
            ? "MyAnimeList denied this request. Check your API configuration and try again later."
            : "MyAnimeList could not complete this request.",
          r.status === 404 ? 404 : 502,
        );
      const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
      if (canCache) {
        if (cache.size >= 250) cache.delete(cache.keys().next().value);
        cache.set(path, { expires: Date.now() + 1800000, data });
      }
      return data;
    });
  }
  return { request, token };
}
