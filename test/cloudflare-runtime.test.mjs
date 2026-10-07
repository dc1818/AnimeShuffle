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
  let tokenRedirect = false,
    releaseMetadata,
    metadataStarted = false;
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
        if (url.pathname === "/v2/anime/999") {
          metadataStarted = true;
          await new Promise((resolve) => {
            releaseMetadata = resolve;
          });
          return WorkerResponse.json({
            id: 999,
            title: "Slow metadata",
            nsfw: "white",
          });
        }
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
        if (url.hostname === "api.tenrai.org") {
          assert.equal(request.headers.get("Authorization"), null);
          assert.equal(request.headers.get("X-MAL-CLIENT-ID"), null);
          if (url.pathname.endsWith("/videos"))
            return WorkerResponse.json({
              data: {
                promo: [
                  { title: "PV", trailer: { youtube_id: "abcdefghijk" } },
                ],
              },
            });
          if (url.pathname.endsWith("/pictures"))
            return WorkerResponse.json({
              data: [
                {
                  jpg: {
                    image_url:
                      "https://cdn.myanimelist.net/images/anime/1/1.png",
                  },
                },
              ],
            });
          assert.equal(url.searchParams.get("spoilers"), "false");
          return WorkerResponse.json({
            data: [1, 2, 3].map((n) => ({
              mal_id: n,
              user: { username: "critic" + n },
              is_spoiler: false,
              is_preliminary: false,
              review: `Fluid animation. Sample ${n}.`,
            })),
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
    const timed = await mf.dispatchFetch(
      "https://shuffle.example/api/anime/1",
      { headers: { "X-AnimeShuffle-Debug": "1" } },
    );
    assert.equal((await timed.json()).title, "Runtime anime");
    assert.match(timed.headers.get("Server-Timing"), /coordinator_queue;dur=/);
    assert.match(timed.headers.get("Server-Timing"), /mal;dur=/);
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
    // Exercise the real Durable Object alarm path, not just the Node test adapter.
    let enrichment;
    for (let attempt = 0; attempt < 30; attempt++) {
      enrichment = await (await call("/api/taste?ids=1")).json();
      if (enrichment.profiles?.[1]) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(enrichment.profiles?.[1]?.traits[0]?.key, "fluid-animation");
    assert.equal(
      requests.filter((s) => s.startsWith("api.tenrai.org")).length,
      1,
    );
    const videos = await call("/api/trailer/42");
    assert.equal(videos.status, 200);
    assert.equal((await videos.json()).trailers[0].videoId, "abcdefghijk");
    const pictures = await call("/api/pictures/42");
    assert.equal(pictures.status, 200);
    assert.equal((await pictures.json()).pictures.length, 1);
    assert.equal(pictures.headers.get("set-cookie"), null);
    const beforeMediaCache = requests.length;
    await call("/api/trailer/42");
    await call("/api/pictures/42");
    assert.equal(requests.length, beforeMediaCache);
    const pendingMetadata = call("/api/anime/999");
    for (let i = 0; !metadataStarted && i < 100; i++)
      await new Promise((r) => setTimeout(r, 20));
    assert.ok(metadataStarted);
    try {
      const sessionRead = await Promise.race([
        call("/api/session"),
        new Promise((resolve) => setTimeout(() => resolve(null), 1200)),
      ]);
      assert.ok(
        sessionRead,
        "Public metadata must not block account/session requests",
      );
      assert.equal((await sessionRead.json()).account.name, "RuntimeViewer");
      assert.equal(
        timed.headers.get("set-cookie"),
        null,
        "Public reads must not rotate or rewrite cookies",
      );
    } finally {
      releaseMetadata();
      await pendingMetadata;
    }
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
