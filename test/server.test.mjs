import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
const port = 18371,
  origin = `http://localhost:${port}`;
test("local server: OAuth state, private tokens, CSRF, preserved statuses and safe Undo", async (t) => {
  const child = spawn(
    process.execPath,
    ["--import", "./test/mock-fetch.mjs", "server.mjs"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        PORT: String(port),
        MAL_CLIENT_ID: "TEST_ID",
        MAL_CLIENT_SECRET: "TEST_SECRET",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(() => child.kill());
  await Promise.race([
    once(child.stdout, "data"),
    new Promise((_, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Server startup timed out")),
        5000,
      );
      timeout.unref();
    }),
  ]);
  let cookie = "",
    csrf = "";
  async function get(path, options = {}) {
    const r = await fetch(origin + path, {
      redirect: "manual",
      ...options,
      headers: { cookie, ...options.headers },
    });
    if (r.headers.has("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return r;
  }
  async function post(path, data, extra = {}) {
    return get(path, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        ...extra,
      },
      body: JSON.stringify(data),
    });
  }
  let r = await get("/api/session"),
    text = await r.text();
  csrf = JSON.parse(text).csrf;
  assert.equal(JSON.parse(text).connected, false);
  assert.ok(!text.includes("TEST_SECRET"));
  assert.equal((await get("/.env")).status, 404);
  assert.equal((await get("/api/profile")).status, 401);
  assert.equal(
    (await post("/api/logout", {}, { "X-CSRF-Token": "wrong" })).status,
    403,
  );
  r = await get("/auth/start");
  const auth = new URL(r.headers.get("location"));
  assert.equal(auth.origin, "https://myanimelist.net");
  assert.equal(auth.searchParams.get("code_challenge_method"), "plain");
  assert.ok(auth.searchParams.get("code_challenge").length >= 43);
  r = await get("/auth/callback?code=fake&state=invalid");
  assert.match(r.headers.get("location"), /auth_error=state/);
  r = await get("/auth/start");
  const state = new URL(r.headers.get("location")).searchParams.get("state");
  r = await get("/auth/callback?code=fake&state=" + state);
  assert.equal(r.headers.get("location"), "/?connected=1");
  r = await get("/api/session");
  text = await r.text();
  const session = JSON.parse(text);
  csrf = session.csrf;
  assert.equal(session.connected, true);
  assert.ok(!text.includes("TEST_PRIVATE"));
  assert.equal((await (await get("/api/profile")).json()).name, "Test viewer");
  const preserved = await (await post("/api/plan", { id: 2 })).json();
  assert.equal(preserved.added, false);
  assert.equal(preserved.status, "watching");
  const added = await (await post("/api/plan", { id: 1 })).json();
  assert.equal(added.added, true);
  assert.ok(added.receipt);
  assert.equal(
    (await post("/api/plan/undo", { receipt: added.receipt })).status,
    200,
  );
  assert.equal(
    (await post("/api/plan/undo", { receipt: added.receipt })).status,
    409,
  );
  const changed = await (await post("/api/plan", { id: 3 })).json();
  assert.equal(
    (await post("/api/plan/undo", { receipt: changed.receipt })).status,
    409,
  );
  const concurrent = await Promise.all([
    post("/api/plan", { id: 4 }),
    post("/api/plan", { id: 4 }),
  ]);
  const results = await Promise.all(concurrent.map((r) => r.json()));
  assert.equal(results.filter((r) => r.added).length, 1);
  assert.equal(
    (await post("/api/plan/remove", { id: 4 }, { "X-CSRF-Token": "wrong" }))
      .status,
    403,
  );
  assert.equal(
    (await (await post("/api/plan/remove", { id: 4 })).json())
      .confirmationRequired,
    true,
  );
  assert.equal(
    (await (await post("/api/plan/remove", { id: 4, confirmed: true })).json())
      .removed,
    true,
  );
  assert.equal(
    (await post("/api/plan/remove", { id: 2, confirmed: true })).status,
    409,
  );
  assert.equal((await post("/api/logout", {})).status, 200);
  assert.equal((await get("/api/profile")).status, 401);
});
