import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createCloudApp } from "../cloudflare/app.mjs";
function storage() {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    sql: {
      exec(query, ...args) {
        const statement = db.prepare(query);
        if (statement.columns().length) return statement.all(...args);
        statement.run(...args);
        return [];
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
const env = {
  PUBLIC_ORIGIN: "https://shuffle.example",
  TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
  MAL_CLIENT_ID: "TEST",
  MAL_CLIENT_SECRET: "TEST_SECRET",
};
function browser(getApp, ip = "1.2.3.4") {
  let cookie = "",
    csrf = "";
  return {
    async request(path, data, extra = {}) {
      const response = await getApp().fetch(
        new Request(env.PUBLIC_ORIGIN + path, {
          method: data === undefined ? "GET" : "POST",
          headers: {
            cookie,
            "cf-connecting-ip": ip,
            ...(data === undefined
              ? {}
              : {
                  origin: env.PUBLIC_ORIGIN,
                  "content-type": "application/json",
                  "x-csrf-token": csrf,
                }),
            ...extra,
          },
          body: data === undefined ? undefined : JSON.stringify(data),
        }),
      );
      if (response.headers.get("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      let body;
      try {
        body = await response.json();
      } catch {}
      if (body?.csrf) csrf = body.csrf;
      return { response, body };
    },
  };
}
const anime = {
  id: 42,
  title: "Test anime",
  genres: ["Action"],
  format: "tv",
  episodes: 12,
  duration: 24,
  status: "finished_airing",
  nsfw: "white",
};
test("Cloudflare accounts and sessions survive restart; devices share preferences and per-anime changes", async () => {
  const db = storage();
  let app = createCloudApp(db, env, { interval: 0 });
  const a = browser(() => app),
    b = browser(() => app),
    other = browser(() => app);
  await a.request("/api/session");
  const registered = await a.request("/api/account/register", {
    username: "Viewer",
    password: "a secure testing password",
  });
  assert.equal(registered.response.status, 200);
  assert.equal(registered.body.cloudSync, true);
  assert.match(
    registered.response.headers.get("set-cookie"),
    /HttpOnly.*SameSite=Lax.*Secure/,
  );
  await a.request("/api/account/preferences", {
    preferences: { favoriteGenres: ["Action"] },
  });
  assert.equal(
    (
      await a.request("/api/account/state", {
        revision: 0,
        changes: [{ id: 42, reaction: { anime, action: "watch", at: 123 } }],
      })
    ).response.status,
    200,
  );
  app = createCloudApp(db, env, { interval: 0 });
  assert.equal((await a.request("/api/session")).body.account.name, "Viewer");
  await b.request("/api/session");
  await b.request("/api/account/login", {
    username: "Viewer",
    password: "a secure testing password",
  });
  const shared = (await b.request("/api/account/state")).body;
  assert.equal(shared.reactions[42].action, "watch");
  assert.deepEqual(shared.preferences.favoriteGenres, ["Action"]);
  assert.equal(
    (await b.request("/api/account/state", { revision: 0, changes: [] }))
      .response.status,
    409,
  );
  assert.equal(
    (
      await b.request("/api/account/state", {
        revision: 1,
        changes: [{ id: 42, reaction: null }],
      })
    ).response.status,
    200,
  );
  assert.deepEqual((await a.request("/api/account/state")).body.reactions, {});
  const denied = await a.request(
    "/api/account/state",
    { revision: 2, changes: [] },
    { origin: "https://evil.example" },
  );
  assert.equal(denied.response.status, 403);
  await other.request("/api/session");
  await other.request("/api/account/register", {
    username: "Other",
    password: "a secure testing password",
  });
  assert.deepEqual(
    (await other.request("/api/account/state")).body.reactions,
    {},
  );
  assert.equal((await a.request("/api/logout", {})).response.status, 200);
  assert.equal((await a.request("/api/account/state")).response.status, 401);
  assert.equal(
    (await b.request("/api/account/state")).response.status,
    200,
    "logging out one device leaves the other authenticated",
  );
  db.db.close();
});
test("MAL identity and encrypted connection persist across devices and refreshed tokens survive restart", async () => {
  const db = storage();
  let tokens = 0;
  const fetcher = async (url) =>
    new Response(
      JSON.stringify(
        url.includes("/token")
          ? {
              access_token: "PRIVATE_ACCESS_" + ++tokens,
              refresh_token: "PRIVATE_REFRESH",
              expires_in: 1,
            }
          : { id: 7, name: "MALViewer" },
      ),
    );
  let app = createCloudApp(db, env, { fetcher, interval: 0 });
  const a = browser(() => app);
  await a.request("/api/session");
  const start = await a.request("/auth/start");
  const params = new URL(start.response.headers.get("location")).searchParams;
  const callback = await a.request(
    "/auth/callback?state=" + params.get("state") + "&code=TEST_CODE",
  );
  assert.equal(callback.response.status, 302);
  assert.equal((await a.request("/api/session")).body.account.id, "mal:7");
  assert.equal(
    (
      await a.request(
        "/auth/callback?state=" + params.get("state") + "&code=TEST_CODE",
      )
    ).response.headers.get("location"),
    "/?auth_error=state",
  );
  await a.request("/api/profile");
  assert.ok(tokens >= 2);
  const stored = db.db.prepare("SELECT tokens FROM accounts").get().tokens;
  assert.ok(!stored.includes("PRIVATE"));
  app = createCloudApp(db, env, { fetcher, interval: 0 });
  assert.equal((await a.request("/api/session")).body.connected, true);
  const b = browser(() => app);
  await b.request("/api/session");
  const second = await b.request("/auth/start");
  const state = new URL(
    second.response.headers.get("location"),
  ).searchParams.get("state");
  await b.request("/auth/callback?state=" + state + "&code=OTHER_CODE");
  assert.equal((await b.request("/api/session")).body.account.id, "mal:7");
  assert.equal(db.db.prepare("SELECT count(*) AS n FROM accounts").get().n, 1);
  db.db.close();
});

test("MAL callback failures identify the failing stage without returning provider details", async () => {
  for (const failedStage of ["token", "profile"]) {
    const db = storage();
    const app = createCloudApp(db, env, {
      interval: 0,
      fetcher: async (url) => {
        if (url.includes("/token") && failedStage !== "token")
          return Response.json({
            access_token: "PRIVATE",
            refresh_token: "PRIVATE",
            expires_in: 3600,
          });
        return new Response("PRIVATE_PROVIDER_DETAILS", { status: 401 });
      },
    });
    const a = browser(() => app);
    const start = await a.request("/auth/start");
    const state = new URL(
      start.response.headers.get("location"),
    ).searchParams.get("state");
    const result = await a.request(
      "/auth/callback?state=" + state + "&code=FIXTURE",
    );
    assert.equal(
      result.response.headers.get("location"),
      "/?auth_error=" +
        (failedStage === "token" ? "token_rejected" : failedStage),
    );
    assert.equal((await a.request("/api/session")).body.account, null);
    db.db.close();
  }
});

test("public anime cache survives Worker restart and expires without caching user data", async () => {
  const db = storage();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json({ id: 42, title: "Cached anime", nsfw: "white" });
  };
  let app = createCloudApp(db, env, { interval: 0, fetcher });
  const viewer = browser(() => app);
  assert.equal(
    (await viewer.request("/api/anime/42")).body.title,
    "Cached anime",
  );
  app = createCloudApp(db, env, { interval: 0, fetcher });
  const cachedResult = await viewer.request("/api/anime/42", undefined, {
    "X-AnimeShuffle-Debug": "1",
  });
  assert.match(
    cachedResult.response.headers.get("Server-Timing"),
    /cache_hits;dur=1.0/,
  );
  assert.equal(calls, 1, "a new Worker instance reuses the public response");
  db.sql.exec("UPDATE public_mal_cache SET expires=0");
  app = createCloudApp(db, env, { interval: 0, fetcher });
  await viewer.request("/api/anime/42");
  assert.equal(calls, 2, "expired entries are fetched again");
  db.db.close();
});

test("catalog includes audience ratings and continues beyond the old 5000 offset cutoff", async () => {
  const db = storage();
  try {
    const app = createCloudApp(db, env, {
      interval: 0,
      fetcher: async (raw) => {
        const url = new URL(raw);
        assert.equal(url.pathname, "/v2/anime/ranking");
        assert.equal(url.searchParams.get("offset"), "5050");
        const fields = url.searchParams.get("fields").split(",");
        assert.ok(fields.includes("rating"));
        assert.ok(fields.includes("mean"));
        assert.ok(
          !fields.includes("related_anime"),
          "prequels are detail-only in MAL",
        );
        return Response.json({
          data: [
            {
              node: {
                id: 42,
                title: "All ages",
                rating: "g",
                mean: 7.5,
                nsfw: "white",
              },
            },
          ],
          paging: {
            next: "https://api.myanimelist.net/v2/anime/ranking?offset=5100",
          },
        });
      },
    });
    const result = await browser(() => app).request(
      "/api/catalog?source=popular&offset=5050",
    );
    assert.equal(result.response.status, 200);
    assert.equal(result.body.nextOffset, 5100);
    assert.equal(result.body.data[0].ageRating, "g");
    assert.equal(result.body.data[0].score, 7.5);
  } finally {
    db.db.close();
  }
});

test("personal MAL list imports all 207 plans across pages without the catalog content filter", async () => {
  const db = storage();
  try {
    const app = createCloudApp(db, env, {
      interval: 0,
      fetcher: async (raw) => {
        const url = new URL(raw);
        if (url.pathname.endsWith("/token"))
          return Response.json({
            access_token: "PRIVATE",
            refresh_token: "PRIVATE",
            expires_in: 3600,
          });
        if (url.pathname === "/v2/users/@me")
          return Response.json({ id: 42, name: "Viewer" });
        assert.equal(url.pathname, "/v2/users/@me/animelist");
        assert.equal(
          url.searchParams.get("nsfw"),
          "true",
          "personal lists must include every saved entry",
        );
        const offset = Number(url.searchParams.get("offset"));
        const data = Array.from(
          { length: Math.min(100, 207 - offset) },
          (_, i) => ({
            node: {
              id: offset + i + 1,
              title: `Saved ${offset + i + 1}`,
              nsfw: offset + i < 189 ? "white" : "gray",
            },
            list_status: { status: "plan_to_watch" },
          }),
        );
        return Response.json({
          data,
          paging:
            offset < 200
              ? {
                  next: `https://api.myanimelist.net/v2/users/@me/animelist?offset=${offset + 100}`,
                }
              : {},
        });
      },
    });
    const client = browser(() => app);
    const start = await client.request("/auth/start");
    const state = new URL(
      start.response.headers.get("location"),
    ).searchParams.get("state");
    await client.request(`/auth/callback?state=${state}&code=FIXTURE`);
    const entries = [];
    let offset = 0;
    do {
      const result = await client.request(`/api/list?offset=${offset}`);
      assert.equal(result.response.status, 200);
      entries.push(...result.body.data);
      offset = result.body.nextOffset;
    } while (offset !== null);
    assert.equal(entries.length, 207);
    assert.equal(new Set(entries.map((a) => a.id)).size, 207);
    assert.equal(entries.filter((a) => a.nsfw === "gray").length, 18);
    const { combinedWatchlist } = await import("../src/lib/watchlist.js");
    assert.equal(combinedWatchlist({}, entries).length, 207);
  } finally {
    db.db.close();
  }
});

test("catalog requests include NSFW only with an explicit opt-in query", async () => {
  const db = storage();
  const received = [];
  try {
    const app = createCloudApp(db, env, {
      interval: 0,
      fetcher: async (raw) => {
        received.push(new URL(raw).searchParams.get("nsfw"));
        return Response.json({ data: [], paging: {} });
      },
    });
    const client = browser(() => app);
    for (const query of ["", "&nsfw=true", "&nsfw=false"])
      assert.equal(
        (await client.request("/api/catalog?source=popular" + query)).response
          .status,
        200,
      );
    assert.deepEqual(received, ["false", "true"]); // The final safe request reuses only the safe cache.
  } finally {
    db.db.close();
  }
});
