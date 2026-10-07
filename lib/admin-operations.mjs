import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { AppError } from "./mal.mjs";
import { isResearchAdmin } from "./research-profiles.mjs";
import {
  normalizePreferences,
  matchesPreferences,
} from "../src/lib/preferences.js";
import { buildTaste } from "../src/lib/recommend.js";
import { profileTaste } from "../src/lib/profile-taste.js";
import { vault } from "../cloudflare/security.mjs";
const DAY = 86400000;
const safeJSON = (s, fallback = {}) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
const label = (s, max = 100) =>
  String(s || "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .slice(0, max);
const actions = new Set([
  "rename",
  "suspend",
  "restore",
  "revoke-sessions",
  "preferences",
  "reset-onboarding",
]);
export function requestGeography(request) {
  return {
    country: /^[A-Z]{2}$/.test(
      request.headers.get("X-AnimeShuffle-Country") || "",
    )
      ? request.headers.get("X-AnimeShuffle-Country")
      : "Unknown",
    region: label(request.headers.get("X-AnimeShuffle-Region")),
    city: label(request.headers.get("X-AnimeShuffle-City")),
    timezone: label(request.headers.get("X-AnimeShuffle-Timezone")),
  };
}
export function createAdminOperations({
  storage,
  env,
  research,
  now = Date.now,
}) {
  const sql = storage.sql,
    all = (q, ...a) => Array.from(sql.exec(q, ...a)),
    one = (q, ...a) => all(q, ...a)[0];
  sql.exec(
    "CREATE TABLE IF NOT EXISTS account_controls (id TEXT PRIMARY KEY, disabled INTEGER NOT NULL DEFAULT 0, epoch INTEGER NOT NULL DEFAULT 0, created INTEGER, first_seen INTEGER, last_seen INTEGER, last_network TEXT, network_at INTEGER, note TEXT NOT NULL DEFAULT '')",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS admin_account_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, detail TEXT NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS analytics_daily (day INTEGER NOT NULL, route TEXT NOT NULL, country TEXT NOT NULL, requests INTEGER NOT NULL, errors INTEGER NOT NULL, duration REAL NOT NULL, PRIMARY KEY(day,route,country))",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS analytics_active_accounts (day INTEGER NOT NULL, account_id TEXT NOT NULL, PRIMARY KEY(day,account_id))",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS analytics_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)",
  );
  sql.exec(
    "INSERT OR IGNORE INTO analytics_meta VALUES ('started',?)",
    String(now()),
  );
  const control = (id) =>
    one("SELECT * FROM account_controls WHERE id=?", id) || {
      id,
      disabled: 0,
      epoch: 0,
      created: null,
      first_seen: null,
      last_seen: null,
      network_at: null,
      note: "",
    };
  function ensure(id) {
    sql.exec("INSERT OR IGNORE INTO account_controls(id) VALUES (?)", id);
  }
  function created(id) {
    ensure(id);
    sql.exec(
      "UPDATE account_controls SET created=COALESCE(created,?) WHERE id=?",
      now(),
      id,
    );
  }
  function audit(actor, target, action, reason, detail = {}) {
    sql.exec(
      "INSERT INTO admin_account_audit (at,actor,target,action,reason,detail) VALUES (?,?,?,?,?,?)",
      now(),
      actor,
      target,
      action,
      label(reason, 500),
      JSON.stringify(detail),
    );
  }
  let cleanedAt = 0;
  function cleanup() {
    if (now() - cleanedAt < 3600000) return;
    cleanedAt = now();
    sql.exec(
      "DELETE FROM analytics_daily WHERE day<?",
      Math.floor(now() / DAY) - 90,
    );
    sql.exec(
      "DELETE FROM analytics_active_accounts WHERE day<?",
      Math.floor(now() / DAY) - 90,
    );
    sql.exec(
      "UPDATE account_controls SET last_network=NULL,network_at=NULL WHERE network_at<?",
      now() - 30 * DAY,
    );
    sql.exec("DELETE FROM admin_account_audit WHERE at<?", now() - 180 * DAY);
  }
  function record(
    request,
    { accountId = null, status = 200, duration = 0 } = {},
  ) {
    try {
      const path = new URL(request.url).pathname;
      if (
        path.startsWith("/api/admin/") ||
        !path.startsWith("/api/") ||
        env.ADMIN_ANALYTICS === "false"
      )
        return;
      cleanup();
      const day = Math.floor(now() / DAY),
        geo = requestGeography(request);
      // Group known API routes only. Never store URLs, query strings, searches,
      // credentials, browser fingerprints, referrers or arbitrary path content.
      const route = /^\/api\/(session|list|catalog|search|taste|profile)$/.test(
        path,
      )
        ? path
        : /^\/api\/account\//.test(path)
          ? "/api/account/*"
          : /^\/api\/(anime|trailer|pictures)\//.test(path)
            ? "/api/" + path.split("/")[2] + "/*"
            : "/api/other";
      sql.exec(
        "INSERT INTO analytics_daily VALUES (?,?,?,?,?,?) ON CONFLICT(day,route,country) DO UPDATE SET requests=requests+1,errors=errors+excluded.errors,duration=duration+excluded.duration",
        day,
        route,
        geo.country,
        1,
        status >= 400 ? 1 : 0,
        Math.max(0, Math.min(120000, duration)),
      );
      if (!accountId) return;
      ensure(accountId);
      sql.exec(
        "INSERT OR IGNORE INTO analytics_active_accounts VALUES (?,?)",
        day,
        accountId,
      );
      sql.exec(
        "UPDATE account_controls SET first_seen=COALESCE(first_seen,?),last_seen=? WHERE id=?",
        now(),
        now(),
        accountId,
      );
      const current = control(accountId);
      if (current.network_at && now() - current.network_at < 300000) return;
      const ip = request.headers.get("cf-connecting-ip") || "";
      const network = { ...geo, ip: isIP(ip) ? ip : null };
      const encrypted = vault(env.TOKEN_ENCRYPTION_KEY).seal(network);
      sql.exec(
        "UPDATE account_controls SET last_network=?,network_at=? WHERE id=?",
        encrypted,
        now(),
        accountId,
      );
    } catch {
      /* Optional analytics cannot break login, synchronization or picks. */
    }
  }
  function account(id) {
    const row = one(
      "SELECT id,username,provider,mal_id,preferences,settings,onboarded,revision FROM accounts WHERE id=?",
      id,
    );
    if (!row) throw new AppError("Account not found.", 404);
    const c = control(id);
    const version = createHmac("sha256", env.TOKEN_ENCRYPTION_KEY || "local")
      .update(JSON.stringify([row, c.disabled, c.epoch, c.note]))
      .digest("hex");
    return {
      id: row.id,
      username: row.username,
      provider: row.provider,
      malId: row.mal_id,
      preferences: normalizePreferences(safeJSON(row.preferences)),
      settings: safeJSON(row.settings),
      onboardingComplete: !!row.onboarded,
      revision: row.revision,
      version,
      suspended: !!c.disabled,
      administrator: isResearchAdmin(row, env.ADMIN_ACCOUNT_IDS),
      createdAt: c.created,
      firstSeen: c.first_seen,
      lastSeen: c.last_seen,
      note: c.note,
    };
  }
  const enrich = (anime) => {
    const row = one("SELECT value FROM research_catalog WHERE id=?", anime.id);
    return {
      ...anime,
      ...(row ? safeJSON(row.value) : {}),
      researchTaste: research.projection(anime.id),
    };
  };
  function reactionRows(id, limit = 1000) {
    return all(
      "SELECT anime_id,value FROM reactions WHERE account_id=? ORDER BY COALESCE(json_extract(value,'$.at'),0) DESC,anime_id LIMIT ?",
      id,
      limit,
    ).map((r) => ({ id: r.anime_id, ...safeJSON(r.value) }));
  }
  const compactReaction = (r) => ({
    id: r.id,
    action: r.action,
    at: r.at,
    reason: r.reason || null,
    anime: {
      id: r.anime?.id,
      title: r.anime?.title,
      englishTitle: r.anime?.englishTitle,
      genres: r.anime?.genres,
      format: r.anime?.format,
      episodes: r.anime?.episodes,
      status: r.anime?.status,
    },
  });
  function reactionPage(id, offset = 0) {
    account(id);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
      throw new AppError("Invalid reaction page.");
    const rows = all(
      "SELECT anime_id,value FROM reactions WHERE account_id=? ORDER BY COALESCE(json_extract(value,'$.at'),0) DESC,anime_id LIMIT 101 OFFSET ?",
      id,
      offset,
    ).map((r) => compactReaction({ id: r.anime_id, ...safeJSON(r.value) }));
    return { reactions: rows.slice(0, 100), hasMore: rows.length > 100 };
  }
  function detail(id, actor) {
    cleanup();
    const a = account(id),
      c = control(id);
    let network = null;
    if (c.last_network && c.network_at > now() - 30 * DAY) {
      try {
        network = {
          ...vault(env.TOKEN_ENCRYPTION_KEY).open(c.last_network),
          observedAt: c.network_at,
          approximate: true,
        };
      } catch {
        /* Key rotation can make old observations unavailable. */
      }
    }
    const rows = reactionRows(id),
      total = one("SELECT COUNT(*) n FROM reactions WHERE account_id=?", id).n;
    const reactions = Object.fromEntries(
      rows.map((r) => [r.id, { ...r, anime: enrich(r.anime) }]),
    );
    const taste = profileTaste({
      reactions,
      list: [],
      preferences: a.preferences,
    });
    for (const group of [
      ...taste.interests,
      ...taste.curious,
      ...taste.contrasts,
    ])
      for (const key of ["liked", "disliked", "curious"])
        group[key] = group[key].slice(0, 12).map((e) => ({
          evidence: e.evidence,
          anime: {
            id: e.anime.id,
            title: e.anime.title,
            englishTitle: e.anime.englishTitle,
          },
        }));
    const genres = [
      ...buildTaste(reactions, [], a.preferences, [], false).genres,
    ]
      .map(([name, g]) => ({ name, signal: g.sum, examples: g.count }))
      .sort((x, y) => y.signal - x.signal);
    const history = all(
      "SELECT id,at,actor,action,reason,detail FROM admin_account_audit WHERE target=? ORDER BY id DESC LIMIT 30",
      id,
    ).map((r) => ({ ...r, detail: safeJSON(r.detail) }));
    audit(actor, id, "inspect-account", "Owner inspected stored account data");
    return {
      account: a,
      network,
      reactions: rows.slice(0, 100).map(compactReaction),
      totalReactions: total,
      truncated: total > 100,
      taste,
      genres,
      history,
      scope:
        "Up to 1,000 saved site reactions and onboarding favorites inform this summary. Private MAL lists and browser-only guest data are not stored here. This is not the user's complete browser-side model.",
      warnings: [
        rows.length < 10
          ? "Fewer than ten saved reactions: taste estimates have limited evidence."
          : null,
        !rows.some((r) => r.action === "bad" || r.action === "nope")
          ? "No negative choices: dislikes remain largely unknown."
          : null,
      ].filter(Boolean),
    };
  }
  function list(url) {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100),
      filter = url.searchParams.get("status") || "all";
    const offset = Number(url.searchParams.get("offset") || 0);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 1000000 ||
      !["all", "active", "suspended"].includes(filter)
    )
      throw new AppError("Invalid account page.");
    const where = `WHERE (instr(lower(a.username),lower(?))>0 OR instr(a.id,?)>0) ${filter === "all" ? "" : `AND COALESCE(c.disabled,0)=${filter === "suspended" ? 1 : 0}`}`;
    const from = "FROM accounts a LEFT JOIN account_controls c ON c.id=a.id ";
    const rows = all(
      `SELECT a.id ${from} ${where} ORDER BY COALESCE(c.last_seen,0) DESC,a.id LIMIT 50 OFFSET ?`,
      q,
      q,
      offset,
    );
    return {
      total: one(`SELECT COUNT(*) n ${from} ${where}`, q, q).n,
      offset,
      accounts: rows.map(({ id }) => ({
        ...account(id),
        reactionCounts: all(
          "SELECT json_extract(value,'$.action') action,COUNT(*) count FROM reactions WHERE account_id=? GROUP BY action",
          id,
        ),
      })),
    };
  }
  function overview() {
    cleanup();
    const day = Math.floor(now() / DAY),
      since = day - 29;
    return {
      startedAt: Number(
        one("SELECT value FROM analytics_meta WHERE key='started'").value,
      ),
      accounts: one("SELECT COUNT(*) n FROM accounts").n,
      suspended: one("SELECT COUNT(*) n FROM account_controls WHERE disabled=1")
        .n,
      activeToday: one(
        "SELECT COUNT(*) n FROM analytics_active_accounts WHERE day=?",
        day,
      ).n,
      active30Days: one(
        "SELECT COUNT(DISTINCT account_id) n FROM analytics_active_accounts WHERE day>=?",
        since,
      ).n,
      new30Days: one(
        "SELECT COUNT(*) n FROM account_controls WHERE created>=?",
        now() - 30 * DAY,
      ).n,
      totals: one(
        "SELECT COALESCE(SUM(requests),0) requests,COALESCE(SUM(errors),0) errors,COALESCE(SUM(duration)/NULLIF(SUM(requests),0),0) averageMs FROM analytics_daily WHERE day>=?",
        since,
      ),
      days: all(
        "SELECT day,SUM(requests) requests,SUM(errors) errors FROM analytics_daily WHERE day>=? GROUP BY day ORDER BY day",
        since,
      ),
      countries: all(
        "SELECT country,SUM(requests) requests,SUM(errors) errors FROM analytics_daily WHERE day>=? GROUP BY country ORDER BY requests DESC LIMIT 30",
        since,
      ),
      routes: all(
        "SELECT route,SUM(requests) requests,SUM(errors) errors,SUM(duration)/SUM(requests) averageMs FROM analytics_daily WHERE day>=? GROUP BY route ORDER BY requests DESC",
        since,
      ),
      reactions: all(
        "SELECT json_extract(value,'$.action') action,COUNT(*) count FROM reactions GROUP BY action",
      ),
      history: all(
        "SELECT id,at,actor,target,action,reason FROM admin_account_audit ORDER BY id DESC LIMIT 50",
      ),
      collectionEnabled: env.ADMIN_ANALYTICS !== "false",
      retention: { networkDays: 30, aggregateDays: 90, auditDays: 180 },
    };
  }
  function algorithm() {
    const sample = all(
        "SELECT value FROM reactions ORDER BY account_id,anime_id LIMIT 20000",
      ).map((r) => safeJSON(r.value)),
      genres = new Map(),
      reasons = new Map();
    for (const r of sample) {
      for (const g of r.anime?.genres || []) {
        const v = genres.get(g) || {
          genre: g,
          good: 0,
          bad: 0,
          watch: 0,
          nope: 0,
        };
        if (Object.hasOwn(v, r.action)) v[r.action]++;
        genres.set(g, v);
      }
      if (r.reason) reasons.set(r.reason, (reasons.get(r.reason) || 0) + 1);
    }
    return {
      sampleSize: sample.length,
      totalReactions: one("SELECT COUNT(*) n FROM reactions").n,
      genres: [...genres.values()].sort(
        (a, b) =>
          b.good + b.bad + b.watch + b.nope - a.good - a.bad - a.watch - a.nope,
      ),
      reasons: [...reasons]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      titles: all(
        "SELECT anime_id id,MAX(json_extract(value,'$.anime.title')) title,SUM(json_extract(value,'$.action')='good') good,SUM(json_extract(value,'$.action')='bad') bad,SUM(json_extract(value,'$.action')='watch') watch,SUM(json_extract(value,'$.action')='nope') nope,COUNT(*) votes FROM reactions GROUP BY anime_id ORDER BY votes DESC LIMIT 50",
      ),
      lowEvidenceAccounts: one(
        "SELECT COUNT(*) n FROM accounts a WHERE (SELECT COUNT(*) FROM reactions r WHERE r.account_id=a.id)<10",
      ).n,
      research: research.stats(),
      modelProfiles: one(
        "SELECT COUNT(*) n FROM model_catalog_profiles WHERE value IS NOT NULL",
      ).n,
      limitations: [
        "These are saved current reactions, not impressions or click-through rates. Undo and replacement change the totals.",
        "Would Watch is interest, not verified enjoyment. No causal improvement or conversion rate can be inferred without exposure data.",
        "Location/IP is operational analytics only and is not used as a taste or ranking feature.",
      ],
    };
  }
  function simulate(id, animeId) {
    if (!Number.isSafeInteger(animeId) || animeId <= 0)
      throw new AppError("Enter a positive MAL ID.");
    const a = account(id),
      rows = reactionRows(id, 400);
    const saved = one("SELECT value FROM research_catalog WHERE id=?", animeId);
    if (!saved)
      throw new AppError(
        "This title is not in the stored catalog. Open it on the site first.",
        404,
      );
    const candidate = enrich(safeJSON(saved.value));
    const reactions = Object.fromEntries(
      rows.map((r) => [r.id, { ...r, anime: enrich(r.anime) }]),
    );
    const corpus = all(
      "SELECT value FROM research_catalog ORDER BY id LIMIT 200",
    ).map((r) => enrich(safeJSON(r.value)));
    const taste = buildTaste(reactions, [], a.preferences, corpus);
    const result = taste.model.score(candidate),
      explanation = taste.model.explain(candidate);
    return {
      candidate,
      result,
      passesFilters: matchesPreferences(candidate, a.preferences),
      alreadyReacted: !!reactions[animeId],
      support: taste.model.support(candidate),
      contributions: explanation.contributions
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, 30),
      neighbors: explanation.neighbors,
      trainingCount: taste.records.size,
      scope:
        "Diagnostic sample: up to 400 stored reactions and 200 catalog titles. Private MAL history, unseen client state, eligibility checks, diversity and community adjustments are not reproduced. Scores are not calibrated probabilities.",
    };
  }
  function mutate(id, body, actor) {
    if (
      !actions.has(body.action) ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 3 ||
      body.reason.length > 500 ||
      body.confirm !== id
    )
      throw new AppError(
        "Choose an action, provide a reason and confirm the exact account ID.",
      );
    return storage.transactionSync(() => {
      const a = account(id);
      if (body.expectedVersion !== a.version)
        throw new AppError("Account changed. Reload it before saving.", 409);
      if (body.action === "suspend" && (id === actor || a.administrator))
        throw new AppError("Owner accounts cannot be suspended here.", 400);
      ensure(id);
      const before = {
        username: a.username,
        preferences: a.preferences,
        onboardingComplete: a.onboardingComplete,
        suspended: a.suspended,
      };
      if (body.action === "rename") {
        const name =
          typeof body.username === "string" ? body.username.trim() : "";
        if (a.provider !== "local")
          throw new AppError("MAL usernames are managed by MyAnimeList.");
        if (!/^[a-zA-Z0-9_]{3,24}$/.test(name))
          throw new AppError(
            "Use a 3–24 character username with letters, numbers or underscores.",
          );
        if (
          one(
            "SELECT id FROM accounts WHERE username_key=? AND id!=?",
            name.toLowerCase(),
            id,
          )
        )
          throw new AppError("That username is already taken.", 409);
        sql.exec(
          "UPDATE accounts SET username=?,username_key=? WHERE id=?",
          name,
          name.toLowerCase(),
          id,
        );
      } else if (["suspend", "restore"].includes(body.action)) {
        sql.exec(
          "UPDATE account_controls SET disabled=?,epoch=epoch+1,note=? WHERE id=?",
          body.action === "suspend" ? 1 : 0,
          label(body.reason, 500),
          id,
        );
      } else if (body.action === "revoke-sessions") {
        sql.exec("UPDATE account_controls SET epoch=epoch+1 WHERE id=?", id);
      } else if (body.action === "preferences") {
        if (
          !body.preferences ||
          typeof body.preferences !== "object" ||
          Array.isArray(body.preferences)
        )
          throw new AppError("Invalid viewing preferences.");
        sql.exec(
          "UPDATE accounts SET preferences=? WHERE id=?",
          JSON.stringify(normalizePreferences(body.preferences)),
          id,
        );
      } else if (body.action === "reset-onboarding")
        sql.exec("UPDATE accounts SET onboarded=0 WHERE id=?", id);
      sql.exec("UPDATE accounts SET revision=revision+1 WHERE id=?", id);
      const after = account(id);
      audit(actor, id, body.action, body.reason, {
        before,
        after: {
          username: after.username,
          preferences: after.preferences,
          onboardingComplete: after.onboardingComplete,
          suspended: after.suspended,
        },
      });
      return { account: after, changed: body.action };
    });
  }
  function route(url, method, body, actor) {
    const path = url.pathname;
    if (path === "/api/admin/overview" && method === "GET") return overview();
    if (path === "/api/admin/accounts" && method === "GET") return list(url);
    if (path === "/api/admin/algorithm" && method === "GET") return algorithm();
    if (path === "/api/admin/account/reactions" && method === "GET")
      return reactionPage(
        url.searchParams.get("id"),
        Number(url.searchParams.get("offset") || 0),
      );
    if (path === "/api/admin/account" && method === "GET")
      return detail(url.searchParams.get("id"), actor);
    if (path === "/api/admin/account/action" && method === "POST")
      return mutate(body.id, body, actor);
    if (path === "/api/admin/simulate" && method === "POST")
      return simulate(body.id, body.animeId);
    return undefined;
  }
  return { route, record, control, created, cleanup };
}
