/** Official JSON APIs only. No HTML, search engine, scraper or LLM fallback. */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export class TraitApiError extends Error {
  constructor(provider, code, status = null) {
    super(`${provider}: ${code}${status ? ` (HTTP ${status})` : ""}`);
    this.provider = provider;
    this.code = code;
    this.status = status;
    this.stopProvider = [401, 403, 429].includes(status);
  }
}

export async function saveJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
}

export function createDiskApiCache(directory) {
  const path = (url) =>
    join(directory, createHash("sha256").update(url).digest("hex") + ".json");
  return {
    async get(url) {
      try {
        const entry = JSON.parse(await readFile(path(url), "utf8"));
        return entry.url === url ? entry : null;
      } catch (error) {
        if (error.code === "ENOENT" || error instanceof SyntaxError)
          return null;
        throw error;
      }
    },
    set: (url, entry) => saveJson(path(url), { ...entry, url }),
  };
}

export function retryAfterMs(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Math.max(0, Date.parse(value) - now) || 0;
}

const MAL_FIELDS =
  "id,title,alternative_titles,synopsis,genres,num_episodes,media_type,status";
export function createOfficialTraitApi({
  malClientId,
  tmdbToken,
  cache,
  offline = false,
  refresh = false,
  fetcher = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  intervalMs = 1100,
  ttlMs = 7 * 86400000,
  attempts = 4,
} = {}) {
  const nextAt = new Map(),
    stopped = new Map();
  const stats = { requests: 0, cacheHits: 0, retries: 0 };
  async function request(provider, path) {
    const base =
      provider === "mal"
        ? "https://api.myanimelist.net/v2"
        : "https://api.themoviedb.org/3";
    const url = base + path;
    const cached = await cache?.get(url);
    if (
      cached &&
      Number.isFinite(cached.fetchedAt) &&
      cached.data &&
      (offline || (!refresh && now() - cached.fetchedAt < ttlMs))
    ) {
      stats.cacheHits++;
      return {
        data: cached.data,
        accessedAt: new Date(cached.fetchedAt).toISOString(),
        url,
        cached: true,
      };
    }
    if (offline) throw new TraitApiError(provider, "offline_cache_miss");
    if (stopped.has(provider)) throw stopped.get(provider);
    const credential = provider === "mal" ? malClientId : tmdbToken;
    if (!credential) throw new TraitApiError(provider, "missing_credentials");
    const headers = {
      Accept: "application/json",
      ...(provider === "mal"
        ? { "X-MAL-CLIENT-ID": credential }
        : { Authorization: `Bearer ${credential}` }),
    };
    for (let attempt = 0; attempt < attempts; attempt++) {
      const wait = (nextAt.get(provider) || 0) - now();
      if (wait > 0) await sleep(wait);
      nextAt.set(provider, now() + intervalMs);
      let response, data, error;
      try {
        stats.requests++;
        response = await fetcher(url, {
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        // Never include upstream error bodies or credentials in exported reports.
        error = new TraitApiError(provider, "network_or_timeout");
      }
      if (response) {
        if (response.ok) {
          if (
            !response.headers
              .get("content-type")
              ?.toLowerCase()
              .includes("application/json")
          ) {
            error = new TraitApiError(provider, "non_json_response");
          } else {
            try {
              data = await response.json();
            } catch {
              error = new TraitApiError(provider, "invalid_json");
            }
            if (
              !error &&
              (!data || typeof data !== "object" || Array.isArray(data))
            )
              error = new TraitApiError(provider, "invalid_response");
          }
          if (!error) {
            const fetchedAt = now();
            await cache?.set(url, { fetchedAt, data });
            return {
              data,
              url,
              accessedAt: new Date(fetchedAt).toISOString(),
              cached: false,
            };
          }
        } else
          error = new TraitApiError(
            provider,
            "request_failed",
            response.status,
          );
      }
      const retryable =
        !response || response.status === 429 || response.status >= 500;
      const delay = Math.max(
        1000 * 2 ** attempt,
        retryAfterMs(response?.headers.get("retry-after"), now()),
      );
      // A long Retry-After pauses this provider until the next run, never retries early.
      if (!retryable || attempt + 1 === attempts || delay > 60000) {
        if (error.stopProvider) stopped.set(provider, error);
        throw error;
      }
      stats.retries++;
      nextAt.set(provider, Math.max(nextAt.get(provider), now() + delay));
    }
  }
  const validId = (id) => Number.isSafeInteger(id) && id > 0 && id <= 10000000;
  const labels = (items) =>
    Array.isArray(items) && items.every((x) => typeof x?.name === "string");
  return {
    stats,
    async mal(id) {
      if (!validId(id)) throw new TraitApiError("mal", "invalid_id");
      const result = await request("mal", `/anime/${id}?fields=${MAL_FIELDS}`);
      if (
        result.data.id !== id ||
        typeof result.data.title !== "string" ||
        !labels(result.data.genres)
      )
        throw new TraitApiError("mal", "invalid_anime_response");
      return {
        ...result,
        provider: "mal",
        labels: result.data.genres.map((x) => x.name),
      };
    },
    async tmdb(link) {
      if (
        !validId(link?.id) ||
        !["tv", "movie"].includes(link?.type) ||
        link?.scopeVerified !== true
      )
        throw new TraitApiError("tmdb", "exact_adaptation_mapping_required");
      const details = await request(
        "tmdb",
        `/${link.type}/${link.id}?language=en-US`,
      );
      if (
        details.data.id !== link.id ||
        !Array.isArray(details.data.genres) ||
        !details.data.genres.some((x) => x?.id === 16)
      )
        throw new TraitApiError("tmdb", "animation_identity_check_failed");
      const result = await request("tmdb", `/${link.type}/${link.id}/keywords`);
      const keywords =
        link.type === "tv" ? result.data.results : result.data.keywords;
      if (result.data.id !== link.id || !labels(keywords))
        throw new TraitApiError("tmdb", "invalid_keywords_response");
      return {
        ...result,
        provider: "tmdb",
        labels: keywords.map((x) => x.name),
      };
    },
  };
}
