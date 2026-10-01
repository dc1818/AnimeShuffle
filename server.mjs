/**
 * HTTP boundary for local use or a single HTTPS-backed hosted instance.
 * Serves the built frontend and proxies a small set of MAL operations.
 * Client secrets, access tokens, and refresh tokens never enter frontend responses.
 * Session and undo-receipt data are intentionally ephemeral; restarting logs out.
 */
import http from "node:http";
import { serverConfig } from "./lib/config.mjs";
import { createAccountStore, createLoginLimiter } from "./lib/accounts.mjs";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  AppError,
  createMalClient,
  normalize,
  validImage,
  fields,
} from "./lib/mal.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const config = serverConfig();
const { port: PORT, origin } = config;
const clientId = process.env.MAL_CLIENT_ID || "",
  clientSecret = process.env.MAL_CLIENT_SECRET || "";
const mal = createMalClient({ clientId, clientSecret });
const sessions = new Map();
const accounts = createAccountStore(
  process.env.ANIME_SHUFFLE_DATA_DIR || path.join(root, ".data"),
);
const limitLogin = createLoginLimiter();
const random = () => randomBytes(32).toString("base64url");
const eq = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sessionTTL = 8 * 3600000;
setInterval(() => {
  for (const [id, s] of sessions)
    if (s.expires < Date.now()) sessions.delete(id);
}, 60000).unref();
// Rotate session IDs after OAuth so a pre-login session cannot remain authoritative.
function newSession(res) {
  const id = random(),
    s = {
      id,
      csrf: random(),
      expires: Date.now() + sessionTTL,
      receipts: new Map(),
      created: Date.now(),
    };
  if (sessions.size >= 10000)
    throw new AppError("The server is busy. Please try again later.", 503);
  sessions.set(id, s);
  res.setHeader(
    "Set-Cookie",
    `as_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${config.hosted ? "; Secure" : ""}`,
  );
  return s;
}
function getSession(req, res) {
  const id = /(?:^|;\s*)as_session=([\w-]+)/.exec(
    req.headers.cookie || "",
  )?.[1];
  let s = sessions.get(id);
  if (!s || s.expires < Date.now()) s = newSession(res);
  return s;
}
function json(res, code, value) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
function redirect(res, target) {
  res.writeHead(302, { Location: target });
  res.end();
}
async function sessionInfo(s) {
  const saved = s.account ? await accounts.preferences(s.account.id) : {};
  return {
    hosted: config.hosted,
    configured: !!clientId,
    oauthConfigured: !!(clientId && clientSecret),
    connected: !!s.tokens,
    csrf: s.csrf,
    account: s.account || null,
    ...saved,
  };
}
async function body(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 32000) throw new AppError("Request too large.", 413);
  }
  try {
    return JSON.parse(data || "{}");
  } catch {
    throw new AppError("Invalid request body.");
  }
}
function auth(s) {
  if (!s.tokens)
    throw new AppError("Connect MyAnimeList first.", 401, "login_required");
}
function number(value, max = 10000000) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max)
    throw new AppError("Invalid identifier.");
  return n;
}
// TLS terminates at the hosting proxy. Hosted cookies remain Secure and HttpOnly.
function headers(res) {
  if (config.hosted)
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.myanimelist.net https://api-cdn.myanimelist.net; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
}
const server = http.createServer(async (req, res) => {
  headers(res);
  let release;
  try {
    // Health checks do not create sessions or depend on the proxy Host header.
    if (req.url === "/healthz" && ["GET", "HEAD"].includes(req.method)) {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      });
      return res.end(req.method === "HEAD" ? undefined : "ok");
    }
    if (!config.allowedHosts.includes(req.headers.host))
      throw new AppError("Open this app using its configured address.", 403);
    const u = new URL(req.url, origin);
    if (!["GET", "POST"].includes(req.method))
      throw new AppError("Method not allowed.", 405);
    if (!config.hosted && req.headers.host.startsWith("127."))
      return redirect(res, origin + u.pathname + u.search);
    const s = getSession(req, res);
    // All state-changing requests must originate from this app and carry its CSRF token.
    if (req.method === "POST") {
      if (
        req.headers.origin !== origin ||
        !eq(req.headers["x-csrf-token"], s.csrf)
      )
        throw new AppError(
          "Session verification failed. Reload and try again.",
          403,
        );
      if (!(req.headers["content-type"] || "").startsWith("application/json"))
        throw new AppError("JSON required.", 415);
    }
    if (u.pathname === "/api/session" && req.method === "GET")
      return json(res, 200, await sessionInfo(s));
    // Local authentication rotates the cookie and drops any previous account's MAL tokens.
    if (
      ["/api/account/register", "/api/account/login"].includes(u.pathname) &&
      req.method === "POST"
    ) {
      if (s.account)
        throw new AppError("Sign out before switching accounts.", 409);
      limitLogin();
      const input = await body(req);
      const account = u.pathname.endsWith("register")
        ? await accounts.register(input.username, input.password)
        : await accounts.login(input.username, input.password);
      sessions.delete(s.id);
      const fresh = newSession(res);
      fresh.account = account;
      return json(res, 200, await sessionInfo(fresh));
    }
    if (u.pathname === "/api/account/preferences" && req.method === "POST") {
      if (!s.account)
        throw new AppError("Sign in to save account preferences.", 401);
      const input = await body(req);
      return json(
        res,
        200,
        await accounts.savePreferences(s.account.id, input.preferences),
      );
    }
    if (u.pathname === "/api/mal/disconnect" && req.method === "POST") {
      if (s.account?.provider !== "local")
        throw new AppError("Use Sign out for a MyAnimeList login.", 400);
      const account = s.account;
      sessions.delete(s.id);
      const fresh = newSession(res);
      fresh.account = account;
      return json(res, 200, await sessionInfo(fresh));
    }
    // MAL supports plain PKCE: the random verifier also acts as the challenge.
    if (u.pathname === "/auth/start" && req.method === "GET") {
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new AppError("Start the connection from Anime Shuffle.", 403);
      if (!clientId || !clientSecret) return redirect(res, "/?setup=1");
      s.oauth = {
        state: random(),
        verifier: randomBytes(64).toString("base64url"),
        expires: Date.now() + 600000,
      };
      const q = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: origin + "/auth/callback",
        state: s.oauth.state,
        code_challenge: s.oauth.verifier,
        code_challenge_method: "plain",
      });
      return redirect(res, "https://myanimelist.net/v1/oauth2/authorize?" + q);
    }
    // Consume state once, verify its deadline, then exchange the code server-side.
    if (u.pathname === "/auth/callback" && req.method === "GET") {
      const pending = s.oauth;
      delete s.oauth;
      if (
        !pending ||
        pending.expires < Date.now() ||
        !eq(pending.state, u.searchParams.get("state"))
      )
        return redirect(res, "/?auth_error=state");
      if (u.searchParams.has("error") || !u.searchParams.get("code"))
        return redirect(res, "/?auth_error=denied");
      try {
        const tokens = await mal.token({
          grant_type: "authorization_code",
          code: u.searchParams.get("code"),
          code_verifier: pending.verifier,
          redirect_uri: origin + "/auth/callback",
        });
        // Verify the MAL identity before accepting it as the app's login.
        const profile = await mal.request("/users/@me", {
          session: { tokens },
        });
        if (!Number.isInteger(profile.id) || !profile.name)
          throw new AppError("Invalid MAL profile.", 502);
        const account =
          s.account?.provider === "local"
            ? s.account
            : {
                id: `mal:${profile.id}`,
                name: profile.name,
                provider: "mal",
              };
        sessions.delete(s.id);
        const fresh = newSession(res);
        fresh.tokens = tokens;
        fresh.account = account;
        return redirect(res, "/?connected=1");
      } catch {
        return redirect(res, "/?auth_error=exchange");
      }
    }
    if (u.pathname === "/api/logout" && req.method === "POST") {
      sessions.delete(s.id);
      const fresh = newSession(res);
      return json(res, 200, { csrf: fresh.csrf });
    }
    if (u.pathname === "/api/profile") {
      auth(s);
      const p = await mal.request("/users/@me", { session: s });
      return json(res, 200, { id: p.id, name: p.name });
    }
    if (u.pathname === "/api/list") {
      auth(s);
      const offset = number(u.searchParams.get("offset") || 0, 100000);
      const q = new URLSearchParams({
        fields:
          "list_status,genres,num_episodes,media_type,start_season,nsfw,status,average_episode_duration",
        limit: "100",
        offset: String(offset),
        nsfw: "false",
      });
      const data = await mal.request("/users/@me/animelist?" + q, {
        session: s,
      });
      return json(res, 200, {
        data: (data.data || []).map((x) => ({
          ...normalize(x.node),
          listStatus: x.list_status,
        })),
        nextOffset: data.paging?.next ? offset + 100 : null,
      });
    }
    // Same-origin autocomplete. Never expose credentials or accept arbitrary MAL paths.
    if (u.pathname === "/api/search" && req.method === "GET") {
      const query = (u.searchParams.get("q") || "").trim();
      if (query.length < 2 || query.length > 100)
        throw new AppError("Search needs 2 to 100 characters.");
      const params = new URLSearchParams({
        q: query,
        limit: "8",
        nsfw: "false",
        fields: "genres,media_type,nsfw,status,num_episodes",
      });
      const result = await mal.request("/anime?" + params, {
        publicCache: true,
      });
      return json(res, 200, {
        data: (result.data || [])
          .map((x) => normalize(x.node))
          .filter((a) => a.nsfw === "white"),
      });
    }
    if (u.pathname === "/api/catalog") {
      const offset = number(u.searchParams.get("offset") || 0, 5000);
      const source = u.searchParams.get("source") || "popular";
      if (!["popular", "top", "season"].includes(source))
        throw new AppError("Invalid discovery source.");
      const q = new URLSearchParams({
        fields:
          "genres,num_episodes,media_type,start_season,synopsis,nsfw,studios,status,average_episode_duration",
        limit: "50",
        offset: String(offset),
        nsfw: "false",
      });
      let endpoint;
      if (source === "season") {
        const d = new Date();
        endpoint = `/anime/season/${d.getUTCFullYear()}/${["winter", "spring", "summer", "fall"][Math.floor(d.getUTCMonth() / 3)]}`;
      } else {
        endpoint = "/anime/ranking";
        q.set("ranking_type", source === "top" ? "all" : "bypopularity");
      }
      const data = await mal.request(endpoint + "?" + q, { publicCache: true });
      return json(res, 200, {
        data: (data.data || []).map((x) => normalize(x.node)),
        nextOffset: data.paging?.next ? offset + 50 : null,
      });
    }
    if (/^\/api\/anime\/\d+$/.test(u.pathname)) {
      const id = number(u.pathname.split("/").pop());
      const a = await mal.request(
        `/anime/${id}?fields=${encodeURIComponent(fields)}`,
        { publicCache: true },
      );
      return json(res, 200, normalize(a));
    }
    // Serialize mutations per session so two tabs cannot race the existence check.
    if (
      req.method === "POST" &&
      ["/api/plan", "/api/plan/undo"].includes(u.pathname)
    ) {
      const previous = s.mutation || Promise.resolve();
      s.mutation = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
    }
    if (u.pathname === "/api/plan" && req.method === "POST") {
      auth(s);
      const b = await body(req),
        id = number(b.id);
      // An existing list entry must NEVER be converted from watching/completed to plan-to-watch.
      const existing = await mal.request(`/anime/${id}?fields=my_list_status`, {
        session: s,
      });
      if (existing.my_list_status?.status)
        return json(res, 200, {
          added: false,
          status: existing.my_list_status.status,
        });
      const added = await mal.request(`/anime/${id}/my_list_status`, {
        session: s,
        method: "PUT",
        body: { status: "plan_to_watch" },
      });
      const receipt = random();
      if (s.receipts.size >= 30)
        s.receipts.delete(s.receipts.keys().next().value);
      s.receipts.set(receipt, {
        id,
        updated: added.updated_at,
        expires: Date.now() + 3600000,
      });
      return json(res, 200, { added: true, receipt });
    }
    // Only undo our own addition when MAL still reports its original timestamp/status.
    if (u.pathname === "/api/plan/undo" && req.method === "POST") {
      auth(s);
      const b = await body(req),
        receipt = s.receipts.get(b.receipt);
      if (!receipt || receipt.expires < Date.now())
        throw new AppError(
          "This MAL addition can no longer be undone here. Manage it on MyAnimeList.",
          409,
        );
      const current = await mal.request(
        `/anime/${receipt.id}?fields=my_list_status`,
        { session: s },
      );
      const ls = current.my_list_status;
      if (!ls) {
        s.receipts.delete(b.receipt);
        return json(res, 200, { removed: true });
      }
      if (
        ls.status !== "plan_to_watch" ||
        !receipt.updated ||
        ls.updated_at !== receipt.updated ||
        ls.num_episodes_watched > 0 ||
        ls.score > 0
      )
        throw new AppError(
          "This entry changed on MAL since it was added. It has been left untouched.",
          409,
        );
      await mal.request(`/anime/${receipt.id}/my_list_status`, {
        session: s,
        method: "DELETE",
      });
      s.receipts.delete(b.receipt);
      return json(res, 200, { removed: true });
    }
    // Fixed cover-host allowlist prevents this image proxy from becoming an arbitrary fetcher.
    if (u.pathname === "/api/image") {
      const raw = u.searchParams.get("url");
      if (!validImage(raw)) throw new AppError("Invalid cover URL.");
      let r;
      try {
        r = await fetch(raw, {
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
      } catch {
        throw new AppError("Cover unavailable.", 502);
      }
      if (!r.ok || !(r.headers.get("content-type") || "").startsWith("image/"))
        throw new AppError("Cover unavailable.", 502);
      const limit = 8 * 1024 * 1024;
      if (Number(r.headers.get("content-length")) > limit)
        throw new AppError("Cover too large.", 413);
      const reader = r.body.getReader();
      let size = 0;
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          throw new AppError("Cover too large.", 413);
        }
        chunks.push(value);
      }
      res.writeHead(200, {
        "Content-Type": r.headers.get("content-type"),
        "Cache-Control": "private, max-age=1800",
      });
      return res.end(Buffer.concat(chunks));
    }
    if (u.pathname.startsWith("/api/")) throw new AppError("Not found.", 404);
    if (req.method !== "GET") throw new AppError("Method not allowed.", 405);
    const local = path.resolve(
      root,
      "dist",
      "." + decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname),
    );
    if (!local.startsWith(path.join(root, "dist") + path.sep))
      throw new AppError("Not found.", 404);
    const info = await stat(local).catch(() => null);
    if (!info?.isFile()) throw new AppError("Not found.", 404);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css",
      ".js": "text/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    };
    res.writeHead(200, {
      "Content-Type": types[path.extname(local)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(await readFile(local));
  } catch (e) {
    if (!e.status || e.status >= 500) {
      // Log diagnostics, never request bodies, cookies, OAuth queries, or raw error messages.
      console.error(
        "[request-error]",
        JSON.stringify({
          method: req.method,
          route: new URL(req.url, origin).pathname.slice(0, 160),
          code: e.status ? e.code : "server_error",
          errorType:
            e instanceof TypeError
              ? "TypeError"
              : e instanceof SyntaxError
                ? "SyntaxError"
                : "Error",
          operation: e.operation,
          storageCode: e.storageCode,
        }),
      );
    }
    if (!res.headersSent)
      json(res, e.status || 500, {
        error: e.status ? e.message : "Something went wrong. Please try again.",
        code: e.code || "server_error",
      });
    else res.end();
  } finally {
    release?.();
  }
});
server.requestTimeout = 30000;
server.listen(PORT, config.host, () => {
  console.log(
    `\nAnime Shuffle is ready: ${origin}\n${clientId ? "MAL catalog enabled." : "Preview mode. Add MAL credentials to .env for live anime and login."}\nKeep this window open. Press Ctrl+C to stop.\n`,
  );
  if (process.argv.includes("--open")) {
    const command =
      process.platform === "win32"
        ? "cmd"
        : process.platform === "darwin"
          ? "open"
          : "xdg-open";
    const args =
      process.platform === "win32" ? ["/c", "start", "", origin] : [origin];
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  }
});
server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? `Port ${PORT} is busy. Close the other app or set PORT in .env and update your MAL redirect URL.`
      : "Unable to start local server.",
  );
  process.exitCode = 1;
});
