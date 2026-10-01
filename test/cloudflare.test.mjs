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
