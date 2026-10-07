import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createCloudApp } from "../cloudflare/app.mjs";
import { createAdminOperations } from "../lib/admin-operations.mjs";
import { createResearchStore } from "../lib/research-profiles.mjs";
const origin = "https://shuffle.example";
function storage() {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    sql: {
      exec(q, ...args) {
        const s = db.prepare(q);
        if (s.columns().length) return s.all(...args);
        s.run(...args);
        return [];
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
const env = () => ({
  PUBLIC_ORIGIN: origin,
  TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
  REVIEW_ENRICHMENT: "false",
});
function client(app) {
  let cookie = "",
    csrf = "";
  return {
    async req(path, body, extra = {}) {
      const response = await app.fetch(
        new Request(origin + path, {
          method: body ? "POST" : "GET",
          headers: {
            cookie,
            "cf-connecting-ip": "198.51.100.10",
            "X-AnimeShuffle-Country": "US",
            "X-AnimeShuffle-Region": "Maryland",
            "X-AnimeShuffle-City": "Test City",
            ...(body
              ? {
                  origin,
                  "content-type": "application/json",
                  "x-csrf-token": csrf,
                }
              : {}),
            ...extra,
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
      if (response.headers.get("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      const data = await response.json();
      if (data.csrf) csrf = data.csrf;
      return { status: response.status, data };
    },
  };
}
const anime = (id) => ({
  id,
  title: "Anime " + id,
  synopsis: "A pilot uses giant robots in a political rebellion.",
  genres: ["Action", "Sci-Fi"],
  format: "tv",
  episodes: 12,
  status: "finished_airing",
});

test("admin account data is private; edits are versioned, audited and never expose credentials", async () => {
  const s = storage(),
    config = env(),
    app = createCloudApp(s, config),
    owner = client(app),
    user = client(app),
    guest = client(app);
  await owner.req("/api/session");
  const o = await owner.req("/api/account/register", {
    username: "AdminOwner",
    password: "secure-owner-password",
  });
  config.ADMIN_ACCOUNT_IDS = o.data.account.id;
  await user.req("/api/session");
  const u = await user.req("/api/account/register", {
    username: "Member",
    password: "secure-member-password",
  });
  const id = u.data.account.id;
  const paths = [
    "/api/admin/overview",
    "/api/admin/accounts",
    "/api/admin/algorithm",
    "/api/admin/account?id=" + encodeURIComponent(id),
    "/api/admin/account/reactions?id=" + encodeURIComponent(id),
  ];
  for (const path of paths) {
    assert.equal((await guest.req(path)).status, 401);
    assert.equal((await user.req(path)).status, 403);
  }
  s.sql.exec(
    "INSERT INTO reactions VALUES (?,?,?)",
    id,
    123,
    JSON.stringify({
      action: "good",
      reason: "mecha",
      at: Date.now(),
      anime: anime(123),
    }),
  );
  s.sql.exec(
    "INSERT INTO reactions VALUES (?,?,?)",
    id,
    124,
    JSON.stringify({ action: "watch", at: Date.now(), anime: anime(124) }),
  );
  let d = await owner.req("/api/admin/account?id=" + encodeURIComponent(id));
  assert.equal(d.status, 200);
  assert.equal(d.data.totalReactions, 2);
  assert.equal(d.data.network.ip, "198.51.100.10");
  assert.equal(d.data.network.region, "Maryland");
  assert.equal(d.data.account.provider, "local");
  const serialized = JSON.stringify(d.data);
  for (const secret of [
    "password_hash",
    "secure-member-password",
    '"tokens"',
    "salt",
    '"csrf"',
  ])
    assert.ok(!serialized.includes(secret));
  const network = s.sql.exec(
    "SELECT last_network FROM account_controls WHERE id=?",
    id,
  )[0].last_network;
  assert.ok(!network.includes("198.51.100.10"));
  assert.ok(!network.includes("Test City"));
  let body = {
    id,
    action: "rename",
    username: "RenamedMember",
    reason: "Requested correction",
    confirm: id,
    expectedVersion: d.data.account.version,
  };
  assert.equal(
    (
      await owner.req("/api/admin/account/action", body, {
        "x-csrf-token": "wrong",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await owner.req("/api/admin/account/action", {
        ...body,
        confirm: "different",
      })
    ).status,
    400,
  );
  assert.equal(
    (await owner.req("/api/admin/account/action", body)).status,
    200,
  );
  assert.equal(
    (await owner.req("/api/admin/account/action", body)).status,
    409,
  );
  d = await owner.req("/api/admin/account?id=" + encodeURIComponent(id));
  assert.equal(d.data.account.username, "RenamedMember");
  assert.ok(d.data.history.some((h) => h.action === "rename"));
  assert.equal(
    s.sql.exec("SELECT COUNT(*) n FROM reactions WHERE account_id=?", id)[0].n,
    2,
  );
  const self = await owner.req(
    "/api/admin/account?id=" + encodeURIComponent(o.data.account.id),
  );
  assert.equal(
    (
      await owner.req("/api/admin/account/action", {
        id: o.data.account.id,
        action: "suspend",
        reason: "test protection",
        confirm: o.data.account.id,
        expectedVersion: self.data.account.version,
      })
    ).status,
    400,
  );
  const overview = await owner.req("/api/admin/overview");
  assert.equal(overview.data.accounts, 2);
  assert.equal(overview.data.activeToday, 2);
  assert.ok(overview.data.countries.some((c) => c.country === "US"));
  assert.ok(!JSON.stringify(overview.data).includes("198.51.100.10"));
  s.db.close();
});

test("session revocation and suspension invalidate existing sessions; suspended password logins fail and restore preserves data", async () => {
  const s = storage(),
    config = env(),
    app = createCloudApp(s, config),
    owner = client(app),
    user = client(app);
  await owner.req("/api/session");
  const o = await owner.req("/api/account/register", {
    username: "AdminOwner",
    password: "secure-owner-password",
  });
  config.ADMIN_ACCOUNT_IDS = o.data.account.id;
  await user.req("/api/session");
  const u = await user.req("/api/account/register", {
      username: "Member",
      password: "secure-member-password",
    }),
    id = u.data.account.id;
  async function change(action) {
    const d = await owner.req(
      "/api/admin/account?id=" + encodeURIComponent(id),
    );
    return owner.req("/api/admin/account/action", {
      id,
      action,
      reason: "Operator test",
      confirm: id,
      expectedVersion: d.data.account.version,
    });
  }
  assert.equal((await change("revoke-sessions")).status, 200);
  assert.equal((await user.req("/api/account/state")).status, 401);
  await user.req("/api/session");
  assert.equal(
    (
      await user.req("/api/account/login", {
        username: "Member",
        password: "secure-member-password",
      })
    ).status,
    200,
  );
  assert.equal((await change("suspend")).status, 200);
  assert.equal((await user.req("/api/account/state")).status, 401);
  await user.req("/api/session");
  assert.equal(
    (
      await user.req("/api/account/login", {
        username: "Member",
        password: "secure-member-password",
      })
    ).status,
    403,
  );
  assert.equal((await change("restore")).status, 200);
  assert.equal(
    (
      await user.req("/api/account/login", {
        username: "Member",
        password: "secure-member-password",
      })
    ).status,
    200,
  );
  const d = await owner.req("/api/admin/account?id=" + encodeURIComponent(id));
  assert.equal(
    (
      await owner.req("/api/admin/account/action", {
        id,
        action: "preferences",
        preferences: {
          favoriteGenres: ["Action"],
          formats: ["movies"],
          admin: true,
        },
        reason: "Filter correction",
        confirm: id,
        expectedVersion: d.data.account.version,
      })
    ).status,
    200,
  );
  const state = await user.req("/api/account/state");
  assert.deepEqual(state.data.preferences.formats, ["movies"]);
  assert.equal(state.data.preferences.admin, undefined);
  s.db.close();
});

test("network retention, safe aggregate routes and complete reaction paging are enforced", () => {
  const s = storage(),
    config = env();
  createCloudApp(s, config);
  let clock = Date.now();
  s.sql.exec(
    "INSERT INTO accounts(id,username,provider) VALUES ('member','Member','local')",
  );
  const research = createResearchStore(s),
    ops = createAdminOperations({
      storage: s,
      env: config,
      research,
      now: () => clock,
    });
  const request = new Request(origin + "/api/search?q=private-search", {
    headers: {
      "cf-connecting-ip": "2001:db8::1",
      "X-AnimeShuffle-Country": "GB",
      "user-agent": "do-not-save-me",
    },
  });
  ops.record(request, { accountId: "member", status: 200, duration: 12 });
  let d = ops.route(
    new URL(origin + "/api/admin/account?id=member"),
    "GET",
    null,
    "owner",
  );
  assert.equal(d.network.ip, "2001:db8::1");
  assert.equal(d.account.createdAt, null);
  for (let i = 1; i <= 205; i++)
    s.sql.exec(
      "INSERT INTO reactions VALUES (?,?,?)",
      "member",
      i,
      JSON.stringify({ action: "watch", anime: anime(i), at: i }),
    );
  d = ops.route(
    new URL(origin + "/api/admin/account?id=member"),
    "GET",
    null,
    "owner",
  );
  assert.equal(d.reactions.length, 100);
  assert.equal(d.totalReactions, 205);
  assert.equal(d.truncated, true);
  const page = ops.route(
    new URL(origin + "/api/admin/account/reactions?id=member&offset=200"),
    "GET",
    null,
    "owner",
  );
  assert.equal(page.reactions.length, 5);
  assert.equal(page.hasMore, false);
  const raw = JSON.stringify(s.sql.exec("SELECT * FROM analytics_daily"));
  assert.ok(!raw.includes("private-search"));
  assert.ok(!raw.includes("2001:db8::1"));
  clock += 31 * 86400000;
  d = ops.route(
    new URL(origin + "/api/admin/account?id=member"),
    "GET",
    null,
    "owner",
  );
  assert.equal(d.network, null);
  assert.equal(
    s.sql.exec("SELECT last_network FROM account_controls WHERE id='member'")[0]
      .last_network,
    null,
  );
  s.db.close();
});

test("candidate diagnostics use stored tastes without mutating user records or claiming full live ranking", () => {
  const s = storage(),
    config = env();
  createCloudApp(s, config);
  const research = createResearchStore(s),
    ops = createAdminOperations({ storage: s, env: config, research });
  s.sql.exec(
    "INSERT INTO accounts(id,username,provider) VALUES ('member','Member','local')",
  );
  research.remember(anime(222));
  s.sql.exec(
    "INSERT INTO reactions VALUES (?,?,?)",
    "member",
    111,
    JSON.stringify({ action: "good", anime: anime(111), at: 1 }),
  );
  const result = ops.route(
    new URL(origin + "/api/admin/simulate"),
    "POST",
    { id: "member", animeId: 222 },
    "owner",
  );
  assert.equal(result.candidate.id, 222);
  assert.ok(Number.isFinite(result.result.score));
  assert.ok(result.contributions.length);
  assert.match(result.scope, /Private MAL history/);
  assert.equal(s.sql.exec("SELECT COUNT(*) n FROM reactions")[0].n, 1);
  s.db.close();
});
