import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Test accounts live in a temporary directory, never in the user's installation data.
test("account HTTP flow rotates sessions, protects preferences and accepts MAL as login", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "anime-auth-http-"));
  const port = 18374,
    origin = `http://localhost:${port}`;
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
        ANIME_SHUFFLE_DATA_DIR: directory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(async () => {
    const exited = once(child, "exit");
    child.kill();
    await exited;
    await rm(directory, { recursive: true, force: true });
  });
  await Promise.race([
    once(child.stdout, "data"),
    new Promise((_, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Server failed to start")),
        5000,
      );
      timeout.unref();
    }),
  ]);
  let cookie = "",
    csrf = "";
  async function get(url, options = {}) {
    const result = await fetch(origin + url, {
      ...options,
      redirect: "manual",
      headers: { cookie, ...options.headers },
    });
    if (result.headers.has("set-cookie"))
      cookie = result.headers.get("set-cookie").split(";")[0];
    return result;
  }
  const post = (url, body) =>
    get(url, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify(body),
    });
  async function session() {
    const result = await (await get("/api/session")).json();
    csrf = result.csrf;
    return result;
  }
  assert.equal((await session()).account, null);
  assert.equal(
    (await post("/api/account/preferences", { preferences: {} })).status,
    401,
  );
  const oldCookie = cookie,
    oldCsrf = csrf;
  let response = await post("/api/account/register", {
    username: "LocalViewer",
    password: "My unique test passphrase",
  });
  let result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.account.provider, "local");
  assert.equal(result.onboardingComplete, false);
  const accountId = result.account.id;
  assert.notEqual(cookie, oldCookie);
  assert.notEqual(result.csrf, oldCsrf);
  csrf = result.csrf;
  assert.equal(
    (await get("/api/profile")).status,
    401,
    "Local login does not grant MAL access",
  );
  result = await (
    await post("/api/account/preferences", {
      accountId: "mal:7",
      preferences: { formats: ["movies"] },
    })
  ).json();
  assert.equal(result.onboardingComplete, true);
  assert.deepEqual((await session()).preferences.formats, ["movies"]);
  await post("/api/logout", {});
  await session();
  assert.equal(
    (
      await post("/api/account/login", {
        username: "LocalViewer",
        password: "wrong",
      })
    ).status,
    401,
  );
  result = await (
    await post("/api/account/login", {
      username: "localviewer",
      password: "My unique test passphrase",
    })
  ).json();
  assert.equal(result.account.id, accountId);
  assert.deepEqual(result.preferences.formats, ["movies"]);
  csrf = result.csrf;
  async function oauth() {
    const start = await get("/auth/start");
    const state = new URL(start.headers.get("location")).searchParams.get(
      "state",
    );
    const callback = await get("/auth/callback?code=fixture&state=" + state);
    assert.equal(callback.headers.get("location"), "/?connected=1");
    return session();
  }
  result = await oauth();
  assert.equal(
    result.account.id,
    accountId,
    "Connecting MAL retains the signed-in local identity",
  );
  assert.equal(result.connected, true);
  result = await (await post("/api/mal/disconnect", {})).json();
  csrf = result.csrf;
  assert.equal(result.account.id, accountId);
  assert.equal(result.connected, false);
  await post("/api/logout", {});
  await session();
  result = await oauth();
  assert.equal(result.account.provider, "mal");
  assert.equal(result.account.id, "mal:7");
  assert.equal(
    result.onboardingComplete,
    false,
    "Client-supplied accountId could not overwrite another account",
  );
  assert.equal((await get("/.data/accounts.json")).status, 404);
});
