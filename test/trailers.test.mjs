import test from "node:test";
import assert from "node:assert/strict";
import { createTrailerService, trailerId } from "../lib/trailers.mjs";
import { isPublicMetadataRequest } from "../cloudflare/public-routes.mjs";
import { secure } from "../cloudflare/security.mjs";
test("trailers accept safe promo IDs only and reuse cached metadata", async () => {
  let calls = 0;
  const service = createTrailerService({
    fetcher: async (url) => {
      calls++;
      assert.equal(url, "https://api.tenrai.org/v1/anime/42/videos");
      return Response.json({
        data: {
          promo: [
            { trailer: { youtube_id: "https://evil.example" } },
            { trailer: { youtube_id: "abcdefghijk" } },
          ],
          episodes: [{ youtube_id: "xxxxxxxxxxx" }],
        },
      });
    },
  });
  assert.deepEqual(await service.get(42), { videoId: "abcdefghijk" });
  await service.get(42);
  assert.equal(calls, 1);
  assert.equal(trailerId("javascript:alert(1)"), null);
  assert.equal(
    isPublicMetadataRequest(new Request("https://example.com/api/trailer/42")),
    true,
  );
  assert.match(
    secure(new Response()).headers.get("Content-Security-Policy"),
    /frame-src https:\/\/www.youtube-nocookie.com;/,
  );
});
test("missing promos return unavailable and failures remain retryable", async () => {
  const missing = createTrailerService({
    fetcher: async () =>
      Response.json({
        data: {
          promo: [],
          episodes: [{ trailer: { youtube_id: "abcdefghijk" } }],
        },
      }),
  });
  assert.deepEqual(await missing.get(1), { videoId: null });
  let attempts = 0;
  const flaky = createTrailerService({
    fetcher: async () =>
      ++attempts === 1
        ? new Response("", { status: 503 })
        : Response.json({ data: { promo: [] } }),
  });
  await assert.rejects(flaky.get(2));
  await flaky.get(2);
  assert.equal(attempts, 2);
});
