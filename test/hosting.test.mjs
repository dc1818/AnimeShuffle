import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { serverConfig } from "../lib/config.mjs";

test("hosting config requires canonical HTTPS origin and explicit data storage", () => {
  assert.equal(serverConfig({}).host, "127.0.0.1");
  const env = {
    RENDER_EXTERNAL_URL: "https://shuffle.example",
    ANIME_SHUFFLE_DATA_DIR: "/data",
    NODE_ENV: "production",
  };
  assert.equal(serverConfig(env).origin, "https://shuffle.example");
  assert.equal(serverConfig(env).host, "0.0.0.0");
  assert.equal(
    serverConfig({ ...env, PUBLIC_ORIGIN: "https://custom.example/" }).origin,
    "https://custom.example",
  );
  for (const PUBLIC_ORIGIN of [
    "http://shuffle.example",
    "https://shuffle.example/path",
    "https://a:b@shuffle.example",
    "https://shuffle.example/?bad=1",
  ]) {
    assert.throws(() => serverConfig({ ...env, PUBLIC_ORIGIN }));
  }
  assert.throws(() => serverConfig({ NODE_ENV: "production" }));
  assert.throws(() =>
    serverConfig({ PUBLIC_ORIGIN: "https://shuffle.example" }),
  );
});

test("hosted server keeps secure cookies, canonical OAuth redirects and CSRF checks", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "shuffle-hosted-"));
  const port = 18375;
  const child = spawn(
    process.execPath,
    ["--import", "./test/mock-fetch.mjs", "server.mjs"],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: "production",
        PUBLIC_ORIGIN: "https://shuffle.example",
        ANIME_SHUFFLE_DATA_DIR: dir,
        MAL_CLIENT_ID: "TEST_ID",
        MAL_CLIENT_SECRET: "TEST_SECRET",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(async () => {
    child.kill();
    await once(child, "exit");
    await rm(dir, { recursive: true, force: true });
  });
  await Promise.race([
    once(child.stdout, "data"),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(Error("Startup timeout")), 5000);
      timer.unref();
    }),
  ]);
  let cookie = "";
  function request(url, { method = "GET", headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: url,
          method,
          headers: { Host: "shuffle.example", Cookie: cookie, ...headers },
        },
        (res) => {
          let text = "";
          res.on("data", (c) => (text += c));
          res.on("end", () =>
            resolve({ status: res.statusCode, headers: res.headers, text }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  }
  const search = await request("/api/search?q=Anime");
  assert.equal(search.status, 200);
  const found = JSON.parse(search.text).data;
  assert.equal(found.length, 1);
  assert.equal(found[0].title, "Search fixture");
  assert.match(found[0].image, /myanimelist/);
  assert.equal((await request("/api/search?q=a")).status, 400);
  let r = await request("/healthz", { headers: { Host: "internal-check" } });
  assert.equal(r.status, 200);
  assert.equal(r.headers["set-cookie"], undefined);
  assert.equal(
    (
      await request("/api/session", {
        headers: {
          Host: "evil.example",
          "X-Forwarded-Host": "shuffle.example",
        },
      })
    ).status,
    403,
  );
  r = await request("/api/session");
  assert.equal(r.status, 200);
  assert.match(r.headers["set-cookie"][0], /; Secure/);
  assert.ok(r.headers["strict-transport-security"]);
  cookie = r.headers["set-cookie"][0].split(";")[0];
  const session = JSON.parse(r.text);
  assert.equal(session.hosted, true);
  assert.equal(session.oauthConfigured, true);
  r = await request("/auth/start", {
    headers: { "X-Forwarded-Host": "evil.example" },
  });
  const auth = new URL(r.headers.location);
  assert.equal(
    auth.searchParams.get("redirect_uri"),
    "https://shuffle.example/auth/callback",
  );
  r = await request(
    "/auth/callback?code=fake&state=" + auth.searchParams.get("state"),
  );
  assert.equal(r.headers.location, "/?connected=1");
  cookie = r.headers["set-cookie"][0].split(";")[0];
  const signedIn = JSON.parse((await request("/api/session")).text);
  assert.equal(signedIn.account.provider, "mal");
  const headers = {
    "Content-Type": "application/json",
    "X-CSRF-Token": signedIn.csrf,
    Origin: "https://evil.example",
  };
  assert.equal(
    (await request("/api/logout", { method: "POST", headers, body: "{}" }))
      .status,
    403,
  );
  headers.Origin = "https://shuffle.example";
  assert.equal(
    (await request("/api/logout", { method: "POST", headers, body: "{}" }))
      .status,
    200,
  );
  for (const url of ["/privacy.html", "/terms.html"])
    assert.equal((await request(url)).status, 200);
});
