import { requestTiming } from "../lib/timing.mjs";
/** Persistent Cloudflare API. SQL statements bind every user-controlled value.
 * A single small-installation Durable Object serializes requests, including MAL mutations.
 * Accounts/reactions live in SQLite; tokens and OAuth verifiers are encrypted at rest.
 */
import {
  AppError,
  createMalClient,
  fields,
  normalize,
  validImage,
} from "../lib/mal.mjs";
import { normalizePreferences } from "../src/lib/preferences.js";
import { parseWatchlistBackup } from "../src/lib/watchlist.js";
import {
  random,
  digest,
  equal,
  passwordHash,
  vault,
  secure,
} from "./security.mjs";
const DAY = 86400000;
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const redirect = (url) =>
  new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
export function createCloudApp(
  storage,
  env,
  { fetcher = fetch, interval = 700 } = {},
) {
  const sql = storage.sql;
  const all = (query, ...args) => Array.from(sql.exec(query, ...args));
  const one = (query, ...args) => all(query, ...args)[0];
  sql.exec(
    `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT UNIQUE, salt TEXT, password_hash TEXT, provider TEXT NOT NULL, mal_id INTEGER UNIQUE, tokens TEXT, preferences TEXT NOT NULL DEFAULT '{}', settings TEXT NOT NULL DEFAULT '{}', onboarded INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0)`,
  );
  sql.exec(
    `CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL)`,
  );
  sql.exec(`CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires)`);
  sql.exec(
    `CREATE TABLE IF NOT EXISTS reactions (account_id TEXT NOT NULL, anime_id INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(account_id,anime_id))`,
  );
  sql.exec(
    `CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)`,
  );
  sql.exec("CREATE INDEX IF NOT EXISTS limits_expiry ON limits(expires)");
  // Public catalog/detail responses survive Worker restarts; private MAL lists never enter this cache.
  sql.exec(
    "CREATE TABLE IF NOT EXISTS public_mal_cache (path TEXT PRIMARY KEY, expires INTEGER NOT NULL, value TEXT NOT NULL)",
  );
  const malClient = createMalClient({
    clientId: env.MAL_CLIENT_ID,
    clientSecret: env.MAL_CLIENT_SECRET,
    fetcher,
    interval,
    publicStore: {
      get(path) {
        const row = one(
          "SELECT expires, value FROM public_mal_cache WHERE path=? AND expires>?",
          path,
          Date.now(),
        );
        if (!row) return undefined;
        try {
          return { expires: row.expires, data: JSON.parse(row.value) };
        } catch {
          return undefined;
        }
      },
      set(path, entry) {
        sql.exec("DELETE FROM public_mal_cache WHERE expires<=?", Date.now());
        sql.exec(
          "INSERT OR REPLACE INTO public_mal_cache VALUES (?, ?, ?)",
          path,
          entry.expires,
          JSON.stringify(entry.data),
        );
        // Bound storage even when many users browse unrelated titles.
        sql.exec(
          "DELETE FROM public_mal_cache WHERE path IN (SELECT path FROM public_mal_cache ORDER BY expires DESC LIMIT -1 OFFSET 500)",
        );
      },
    },
  });
  function rateLimit(key, max, window) {
    const row = one("SELECT * FROM limits WHERE key=?", key);
    const count = row && row.expires > Date.now() ? row.count + 1 : 1;
    const expires =
      row && row.expires > Date.now() ? row.expires : Date.now() + window;
    sql.exec(
      "INSERT INTO limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,expires=excluded.expires",
      key,
      count,
      expires,
    );
    if (count > max)
      throw new AppError("Too many requests. Please wait and try again.", 429);
  }
  function cleanSettings(value = {}) {
    return {
      autoAdd: value.autoAdd === true,
      dynamic: value.dynamic !== false,
    };
  }
  function accountInfo(row) {
    return row
      ? { id: row.id, name: row.username, provider: row.provider }
      : null;
  }
  function stateFor(id) {
    const row = one("SELECT * FROM accounts WHERE id=?", id);
    return {
      revision: row.revision,
      reactions: Object.fromEntries(
        all("SELECT anime_id,value FROM reactions WHERE account_id=?", id).map(
          (r) => [r.anime_id, JSON.parse(r.value)],
        ),
      ),
      settings: cleanSettings(JSON.parse(row.settings)),
      preferences: normalizePreferences(JSON.parse(row.preferences)),
      onboardingComplete: !!row.onboarded,
    };
  }
  async function input(req, limit = 1024 * 1024) {
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      throw new AppError("JSON required.", 415);
    const reader = req.body?.getReader();
    let size = 0;
    const chunks = [];
    if (reader)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new AppError("Request too large.", 413);
        }
        chunks.push(value);
      }
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw Error();
      return data;
    } catch {
      throw new AppError("Invalid request body.");
    }
  }
  function number(value, max = 10000000) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0 || n > max)
      throw new AppError("Invalid identifier.");
    return n;
  }
  return {
    async fetch(req) {
      const measured = requestTiming(
        malClient,
        req.headers.get("X-AnimeShuffle-Debug") === "1",
      );
      const mal = measured.mal;
      let session, sessionHash, setCookie, tokenSession, account, encryption;
      const u = new URL(req.url);
      try {
        const origin = env.PUBLIC_ORIGIN || u.origin;
        if (u.origin !== origin)
          throw new AppError(
            "Open Anime Shuffle at its configured address.",
            403,
          );
        if (!["GET", "POST"].includes(req.method))
          throw new AppError("Method not allowed.", 405);
        encryption = vault(env.TOKEN_ENCRYPTION_KEY);
        const cookieName = origin.startsWith("https:")
          ? "__Host-as_session"
          : "as_session";
        const cookieValue = req.headers
          .get("cookie")
          ?.split(/;\s*/)
          .find((x) => x.startsWith(cookieName + "="))
          ?.slice(cookieName.length + 1);
        if (cookieValue && /^[\w-]{43}$/.test(cookieValue)) {
          sessionHash = digest(cookieValue);
          const found = one(
            "SELECT payload FROM sessions WHERE hash=? AND expires>?",
            sessionHash,
            Date.now(),
          );
          if (found) session = encryption.open(found.payload);
        }
        function rotate(accountId = null) {
          if (sessionHash)
            sql.exec("DELETE FROM sessions WHERE hash=?", sessionHash);
          const value = random();
          sessionHash = digest(value);
          session = {
            csrf: random(),
            accountId,
            expires: Date.now() + (accountId ? 30 * DAY : 3600000),
            receipts: {},
          };
          setCookie = `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${accountId ? 2592000 : 3600}${origin.startsWith("https:") ? "; Secure" : ""}`;
        }
        if (!session) {
          rateLimit(
            "session:" + digest(req.headers.get("cf-connecting-ip") || "local"),
            120,
            3600000,
          );
          rotate();
        }
        account = session.accountId
          ? one("SELECT * FROM accounts WHERE id=?", session.accountId)
          : null;
        if (session.accountId && !account) {
          rotate();
          account = null;
        }
        tokenSession = {
          tokens: account?.tokens ? encryption.open(account.tokens) : null,
        };
        const auth = () => {
          if (!tokenSession.tokens)
            throw new AppError(
              "Connect MyAnimeList first.",
              401,
              "login_required",
            );
        };
        const signedIn = () => {
          if (!account)
            throw new AppError(
              "Sign in to save your account data.",
              401,
              "login_required",
            );
        };
        const info = () => ({
          hosted: true,
          cloudSync: true,
          configured: !!env.MAL_CLIENT_ID,
          oauthConfigured: !!(env.MAL_CLIENT_ID && env.MAL_CLIENT_SECRET),
          connected: !!tokenSession.tokens,
          csrf: session.csrf,
          account: accountInfo(account),
          preferences: normalizePreferences(
            JSON.parse(account?.preferences || "{}"),
          ),
          onboardingComplete: !!account?.onboarded,
        });
        if (req.method === "POST") {
          if (
            req.headers.get("origin") !== origin ||
            !equal(req.headers.get("x-csrf-token"), session.csrf)
          )
            throw new AppError(
              "Session verification failed. Reload and try again.",
              403,
            );
        }
        const path = u.pathname;
        let response;
        if (path === "/api/session" && req.method === "GET")
          response = json(info());
        else if (
          ["/api/account/register", "/api/account/login"].includes(path) &&
          req.method === "POST"
        ) {
          if (account)
            throw new AppError("Sign out before switching accounts.", 409);
          const body = await input(req, 32000);
          const registering = path.endsWith("register");
          const name =
            typeof body.username === "string" ? body.username.trim() : "";
          if (
            !/^[a-zA-Z0-9_]{3,24}$/.test(name) ||
            typeof body.password !== "string" ||
            body.password.length > 128 ||
            body.password.length < (registering ? 12 : 1)
          )
            throw new AppError(
              registering
                ? "Use a 3–24 character username and a password of at least 12 characters."
                : "Incorrect username or password.",
              registering ? 400 : 401,
            );
          rateLimit(
            "login-ip:" +
              digest(req.headers.get("cf-connecting-ip") || "local"),
            20,
            15 * 60000,
          );
          rateLimit("login-name:" + name.toLowerCase(), 20, 15 * 60000);
          let row = one(
            "SELECT * FROM accounts WHERE username_key=?",
            name.toLowerCase(),
          );
          if (registering) {
            if (row) throw new AppError("That username is already taken.", 409);
            const id = "local:" + random(),
              salt = random(),
              hash = passwordHash(body.password, salt);
            sql.exec(
              "INSERT INTO accounts(id,username,username_key,salt,password_hash,provider) VALUES (?,?,?,?,?,?)",
              id,
              name,
              name.toLowerCase(),
              salt,
              hash,
              "local",
            );
            row = one("SELECT * FROM accounts WHERE id=?", id);
          } else {
            const actual = passwordHash(
              body.password,
              row?.salt || "unknown-account-salt",
            );
            if (!row || !equal(actual, row.password_hash))
              throw new AppError("Incorrect username or password.", 401);
          }
          rotate(row.id);
          account = row;
          tokenSession.tokens = row.tokens ? encryption.open(row.tokens) : null;
          response = json(info());
        } else if (
          path === "/api/account/preferences" &&
          req.method === "POST"
        ) {
          signedIn();
          const body = await input(req, 32000);
          const preferences = normalizePreferences(body.preferences);
          sql.exec(
            "UPDATE accounts SET preferences=?,onboarded=1 WHERE id=?",
            JSON.stringify(preferences),
            account.id,
          );
          response = json({ preferences, onboardingComplete: true });
        } else if (path === "/api/account/state") {
          signedIn();
          if (req.method === "GET") response = json(stateFor(account.id));
          else {
            const body = await input(req);
            const changes = body.changes || [];
            if (
              !Number.isInteger(body.revision) ||
              !Array.isArray(changes) ||
              changes.length > 100
            )
              throw new AppError("Invalid sync batch.");
            if (body.revision !== account.revision)
              throw new AppError(
                "Account changed on another device. Refresh and retry.",
                409,
                "sync_conflict",
              );
            const cleaned = changes.map((c) => {
              const id = number(c.id);
              if (!id) throw new AppError("Invalid anime identifier.");
              if (c.reaction === null) return { id, reaction: null };
              const r = c.reaction;
              if (
                !r ||
                !["good", "bad", "watch", "nope"].includes(r.action) ||
                r.anime?.id !== id
              )
                throw new AppError("Invalid reaction.");
              const entry = parseWatchlistBackup(
                JSON.stringify({
                  app: "anime-shuffle",
                  version: 1,
                  entries: [{ anime: r.anime, addedAt: r.at }],
                }),
              )[0];
              if (
                ["good", "bad"].includes(r.action) &&
                entry.anime.status === "not_yet_aired"
              )
                throw new AppError("This anime has not aired yet.");
              return {
                id,
                reaction: {
                  anime: entry.anime,
                  at: entry.addedAt,
                  action: r.action,
                },
              };
            });
            storage.transactionSync(() => {
              for (const c of cleaned) {
                if (c.reaction === null)
                  sql.exec(
                    "DELETE FROM reactions WHERE account_id=? AND anime_id=?",
                    account.id,
                    c.id,
                  );
                else
                  sql.exec(
                    "INSERT INTO reactions VALUES (?,?,?) ON CONFLICT(account_id,anime_id) DO UPDATE SET value=excluded.value",
                    account.id,
                    c.id,
                    JSON.stringify(c.reaction),
                  );
              }
              if (body.settings)
                sql.exec(
                  "UPDATE accounts SET settings=? WHERE id=?",
                  JSON.stringify(cleanSettings(body.settings)),
                  account.id,
                );
              sql.exec(
                "UPDATE accounts SET revision=revision+1 WHERE id=?",
                account.id,
              );
            });
            response = json({ revision: account.revision + 1 });
          }
        } else if (path === "/auth/start" && req.method === "GET") {
          if (req.headers.get("sec-fetch-site") === "cross-site")
            throw new AppError("Start the connection from Anime Shuffle.", 403);
          if (!env.MAL_CLIENT_ID || !env.MAL_CLIENT_SECRET)
            throw new AppError(
              "MAL login is not configured on this deployment.",
              503,
            );
          session.oauth = {
            state: random(),
            verifier: random() + random(),
            expires: Date.now() + 600000,
          };
          response = redirect(
            "https://myanimelist.net/v1/oauth2/authorize?" +
              new URLSearchParams({
                response_type: "code",
                client_id: env.MAL_CLIENT_ID,
                redirect_uri: origin + "/auth/callback",
                state: session.oauth.state,
                code_challenge: session.oauth.verifier,
                code_challenge_method: "plain",
              }),
          );
        } else if (path === "/auth/callback" && req.method === "GET") {
          const pending = session.oauth;
          delete session.oauth;
          if (
            !pending ||
            pending.expires < Date.now() ||
            !equal(pending.state, u.searchParams.get("state"))
          )
            response = redirect("/?auth_error=state");
          else if (u.searchParams.has("error") || !u.searchParams.get("code"))
            response = redirect("/?auth_error=denied");
          else {
            let stage = "token";
            try {
              const tokens = await mal.token({
                grant_type: "authorization_code",
                code: u.searchParams.get("code"),
                code_verifier: pending.verifier,
                redirect_uri: origin + "/auth/callback",
              });
              stage = "profile";
              const profile = await mal.request("/users/@me", {
                session: { tokens },
              });
              if (!Number.isSafeInteger(profile.id) || !profile.name)
                throw Error("Invalid profile");
              stage = "account";
              let target = one(
                "SELECT * FROM accounts WHERE mal_id=?",
                profile.id,
              );
              if (account && target && target.id !== account.id)
                throw new AppError(
                  "This MAL identity belongs to another Anime Shuffle account.",
                  409,
                );
              if (account && account.mal_id && account.mal_id !== profile.id)
                throw new AppError(
                  "Disconnect the existing MAL account before linking another.",
                  409,
                );
              const id = account?.id || target?.id || `mal:${profile.id}`;
              if (!account && !target)
                sql.exec(
                  "INSERT INTO accounts(id,username,provider,mal_id) VALUES (?,?,?,?)",
                  id,
                  String(profile.name).slice(0, 200),
                  "mal",
                  profile.id,
                );
              sql.exec(
                "UPDATE accounts SET mal_id=?,tokens=? WHERE id=?",
                profile.id,
                encryption.seal(tokens),
                id,
              );
              rotate(id);
              account = one("SELECT * FROM accounts WHERE id=?", id);
              tokenSession.tokens = tokens;
              response = redirect("/?connected=1");
            } catch (error) {
              // Log only fixed categories, never provider bodies, auth codes, or tokens.
              const tokenErrors = new Set([
                "token_network",
                "token_client",
                "token_grant",
                "token_forbidden",
                "token_rate_limit",
                "token_unavailable",
                "token_request",
                "token_response",
                "token_rejected",
              ]);
              const reason =
                stage === "token" && tokenErrors.has(error.code)
                  ? error.code
                  : stage;
              console.error(
                "[mal-login-error]",
                reason,
                "upstream_status",
                Number(error.upstreamStatus) || "none",
                "status",
                Number(error.status) || 500,
              );
              response = redirect("/?auth_error=" + reason);
            }
          }
        } else if (path === "/api/logout" && req.method === "POST") {
          rotate();
          account = null;
          tokenSession.tokens = null;
          response = json({ csrf: session.csrf });
        } else if (path === "/api/mal/disconnect" && req.method === "POST") {
          signedIn();
          if (account.provider !== "local")
            throw new AppError("Use Sign out for a MyAnimeList login.");
          sql.exec(
            "UPDATE accounts SET tokens=NULL,mal_id=NULL WHERE id=?",
            account.id,
          );
          tokenSession.tokens = null;
          rotate(account.id);
          response = json(info());
        } else if (path === "/api/profile" && req.method === "GET") {
          auth();
          const p = await mal.request("/users/@me", { session: tokenSession });
          response = json({ id: p.id, name: p.name });
        } else if (path === "/api/list" && req.method === "GET") {
          auth();
          const offset = number(u.searchParams.get("offset") || 0, 100000);
          const q = new URLSearchParams({
            fields:
              "list_status,genres,num_episodes,media_type,start_season,nsfw,status,average_episode_duration,synopsis,studios",
            limit: "100",
            offset: String(offset),
            nsfw: "false",
          });
          const d = await mal.request("/users/@me/animelist?" + q, {
            session: tokenSession,
          });
          response = json({
            data: (d.data || []).map((x) => ({
              ...normalize(x.node),
              listStatus: x.list_status,
            })),
            nextOffset: d.paging?.next ? offset + 100 : null,
          });
        } else if (path === "/api/search" && req.method === "GET") {
          const q = (u.searchParams.get("q") || "").trim();
          if (q.length < 2 || q.length > 100)
            throw new AppError("Search needs 2 to 100 characters.");
          const d = await mal.request(
            "/anime?" +
              new URLSearchParams({
                q,
                limit: "8",
                nsfw: "false",
                fields: "genres,media_type,nsfw,status,num_episodes",
              }),
            { publicCache: true },
          );
          response = json({
            data: (d.data || [])
              .map((x) => normalize(x.node))
              .filter((a) => a.nsfw === "white"),
          });
        } else if (path === "/api/catalog" && req.method === "GET") {
          const offset = number(u.searchParams.get("offset") || 0, 5000),
            source = u.searchParams.get("source") || "popular";
          if (!["popular", "top", "season"].includes(source))
            throw new AppError("Invalid discovery source.");
          const q = new URLSearchParams({
            fields:
              "genres,num_episodes,media_type,start_season,synopsis,nsfw,studios,status,average_episode_duration",
            limit: "50",
            offset: String(offset),
            nsfw: "false",
          });
          let endpoint = "/anime/ranking";
          if (source === "season") {
            const d = new Date();
            endpoint = `/anime/season/${d.getUTCFullYear()}/${["winter", "spring", "summer", "fall"][Math.floor(d.getUTCMonth() / 3)]}`;
          } else
            q.set("ranking_type", source === "top" ? "all" : "bypopularity");
          const d = await mal.request(endpoint + "?" + q, {
            publicCache: true,
          });
          response = json({
            data: (d.data || []).map((x) => normalize(x.node)),
            nextOffset: d.paging?.next ? offset + 50 : null,
          });
        } else if (/^\/api\/anime\/\d+$/.test(path) && req.method === "GET") {
          response = json(
            normalize(
              await mal.request(
                `/anime/${number(path.split("/").pop())}?fields=${encodeURIComponent(fields)}`,
                { publicCache: true },
              ),
            ),
          );
        } else if (path === "/api/plan" && req.method === "POST") {
          auth();
          const b = await input(req, 32000),
            id = number(b.id);
          const existing = await mal.request(
            `/anime/${id}?fields=my_list_status`,
            { session: tokenSession },
          );
          if (existing.my_list_status?.status)
            response = json({
              added: false,
              status: existing.my_list_status.status,
            });
          else {
            const added = await mal.request(`/anime/${id}/my_list_status`, {
              session: tokenSession,
              method: "PUT",
              body: { status: "plan_to_watch" },
            });
            const receipt = random();
            session.receipts[receipt] = {
              id,
              updated: added.updated_at,
              expires: Date.now() + 3600000,
            };
            const keys = Object.keys(session.receipts);
            if (keys.length > 30) delete session.receipts[keys[0]];
            response = json({ added: true, receipt });
          }
        } else if (path === "/api/plan/undo" && req.method === "POST") {
          auth();
          const b = await input(req, 32000),
            receipt = session.receipts[b.receipt];
          if (!receipt || receipt.expires < Date.now())
            throw new AppError(
              "This MAL addition can no longer be undone here.",
              409,
            );
          const current = await mal.request(
              `/anime/${receipt.id}?fields=my_list_status`,
              { session: tokenSession },
            ),
            ls = current.my_list_status;
          if (
            ls &&
            (ls.status !== "plan_to_watch" ||
              !receipt.updated ||
              ls.updated_at !== receipt.updated ||
              ls.num_episodes_watched > 0 ||
              ls.score > 0)
          )
            throw new AppError(
              "This entry changed on MAL and was left untouched.",
              409,
            );
          if (ls)
            await mal.request(`/anime/${receipt.id}/my_list_status`, {
              session: tokenSession,
              method: "DELETE",
            });
          delete session.receipts[b.receipt];
          response = json({ removed: true });
        } else throw new AppError("Not found.", 404);
        if (account) {
          // Refresh-token rotations survive deploys and are shared by this account's devices.
          const encrypted = tokenSession.tokens
            ? encryption.seal(tokenSession.tokens)
            : null;
          if (
            !account.tokens ||
            !tokenSession.tokens ||
            encryption.open(account.tokens).access !==
              tokenSession.tokens.access
          )
            sql.exec(
              "UPDATE accounts SET tokens=? WHERE id=?",
              encrypted,
              account.id,
            );
        }
        sql.exec(
          "INSERT INTO sessions VALUES (?,?,?) ON CONFLICT(hash) DO UPDATE SET payload=excluded.payload,expires=excluded.expires",
          sessionHash,
          encryption.seal(session),
          session.expires,
        );
        sql.exec("DELETE FROM sessions WHERE expires<?", Date.now());
        sql.exec("DELETE FROM limits WHERE expires<?", Date.now());
        if (setCookie) response.headers.set("Set-Cookie", setCookie);
        if (measured.header())
          response.headers.set("Server-Timing", measured.header());
        return secure(response);
      } catch (error) {
        // Consume OAuth state even when an unexpected failure occurs. No secret-bearing messages in logs.
        try {
          if (session && encryption && sessionHash) {
            sql.exec(
              "INSERT INTO sessions VALUES (?,?,?) ON CONFLICT(hash) DO UPDATE SET payload=excluded.payload,expires=excluded.expires",
              sessionHash,
              encryption.seal(session),
              session.expires,
            );
            if (account && tokenSession && !tokenSession.tokens)
              sql.exec(
                "UPDATE accounts SET tokens=NULL WHERE id=?",
                account.id,
              );
          }
        } catch {
          /* Preserve the original error if storage is unavailable. */
        }
        if (!error.status)
          console.error("[cloud-api-error]", u.pathname, error.name);
        const response = json(
          {
            error: error.status
              ? error.message
              : "Cloud storage or configuration is unavailable. Check the Cloudflare deployment settings.",
            code: error.code || "server_error",
          },
          error.status || 503,
        );
        if (setCookie) response.headers.set("Set-Cookie", setCookie);
        if (measured.header())
          response.headers.set("Server-Timing", measured.header());
        return secure(response);
      }
    },
  };
}
