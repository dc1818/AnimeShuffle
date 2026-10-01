import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as WorkerResponse,
} from "miniflare";

// Run the production Worker in workerd, including its real fetch implementation.
// The outbound service replaces MAL at the network boundary, not fetch itself:
// this catches runtime-incompatible Request options that Node mocks miss.
test("Cloudflare runtime completes MAL login and rejects token redirects without forwarding credentials", async () => {
  const compiled = await build({
    entryPoints: ["cloudflare/worker.mjs"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    external: ["cloudflare:workers"],
    target: "es2022",
  });
  let tokenRedirect = false;
  const requests = [];
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      host: "127.0.0.1",
      inspectorHost: "127.0.0.1",
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        BACKEND: { className: "AnimeBackend", useSQLite: true },
      },
      bindings: {
        TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
        MAL_CLIENT_ID: "fixture-client",
        MAL_CLIENT_SECRET: "fixture-secret",
        PUBLIC_ORIGIN: "https://shuffle.example",
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        requests.push(url.hostname + url.pathname);
        if (
          url.hostname === "myanimelist.net" &&
          url.pathname === "/v1/oauth2/token"
        ) {
          const body = new URLSearchParams(await request.text());
          assert.equal(body.get("client_secret"), "fixture-secret");
          assert.equal(
            body.get("redirect_uri"),
            "https://shuffle.example/auth/callback",
          );
          assert.ok(body.get("code_verifier"));
          if (tokenRedirect)
            return new WorkerResponse(null, {
              status: 302,
              headers: { Location: "https://unexpected.invalid/token" },
            });
          return WorkerResponse.json({
            access_token: "fixture-access",
            refresh_token: "fixture-refresh",
            expires_in: 3600,
          });
        }
        if (
          url.hostname === "api.myanimelist.net" &&
          url.pathname === "/v2/users/@me"
        ) {
          assert.equal(
            request.headers.get("Authorization"),
            "Bearer fixture-access",
          );
          return WorkerResponse.json({ id: 7, name: "RuntimeViewer" });
        }
        if (
          url.hostname === "api.myanimelist.net" &&
          url.pathname === "/v2/anime/1"
        ) {
          return WorkerResponse.json({
            id: 1,
            title: "Runtime anime",
            nsfw: "white",
          });
        }
        if (url.hostname === "cdn.myanimelist.net") {
          return new WorkerResponse("fixture-image", {
            headers: { "Content-Type": "image/png" },
          });
        }
        assert.fail("Unexpected outbound destination: " + url.hostname);
      },
    }),
  );
  let cookie = "";
  async function call(path) {
    const response = await mf.dispatchFetch("https://shuffle.example" + path, {
      headers: { cookie },
      redirect: "manual",
    });
    if (response.headers.has("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return response;
  }
  async function login() {
    const start = await call("/auth/start");
    const state = new URL(start.headers.get("location")).searchParams.get(
      "state",
    );
    return call("/auth/callback?code=FIXTURE&state=" + state);
  }
  try {
    await call("/api/session");
    const callback = await login();
    assert.equal(callback.headers.get("location"), "/?connected=1");
    const session = await (await call("/api/session")).json();
    assert.equal(session.account.name, "RuntimeViewer");
    assert.equal(session.connected, true);
    assert.equal(
      (await (await call("/api/anime/1")).json()).title,
      "Runtime anime",
    );
    assert.equal(
      (
        await call(
          "/api/image?url=" +
            encodeURIComponent(
              "https://cdn.myanimelist.net/images/anime/1/1.png",
            ),
        )
      ).status,
      200,
    );
    tokenRedirect = true;
    const before = requests.length;
    assert.equal(
      (await login()).headers.get("location"),
      "/?auth_error=token_rejected",
    );
    assert.equal(
      requests.length,
      before + 1,
      "token redirects must not be followed",
    );
  } finally {
    await mf.dispose();
  }
});
