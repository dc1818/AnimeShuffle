import test from "node:test";
import assert from "node:assert/strict";
import {
  createTrailerService,
  trailerId,
  normalizePictures,
  normalizePromos,
} from "../lib/trailers.mjs";
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
            {
              trailer: { region_restriction: null, youtube_id: "abcdefghijk" },
            },
          ],
          episodes: [{ youtube_id: "xxxxxxxxxxx" }],
        },
      });
    },
  });
  assert.deepEqual(await service.get(42), {
    videoId: "abcdefghijk",
    trailers: [{ videoId: "abcdefghijk", title: "Trailer 1" }],
  });
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
          episodes: [
            {
              trailer: { region_restriction: null, youtube_id: "abcdefghijk" },
            },
          ],
        },
      }),
  });
  assert.deepEqual(await missing.get(1), { videoId: null, trailers: [] });
  let attempts = 0;
  const flaky = createTrailerService({
    fetcher: async () =>
      ++attempts === 1
        ? new Response("", { status: 503 })
        : Response.json({ data: { promo: [] } }),
  });
  await assert.rejects(flaky.get(2));
  await flaky.get(2);
  assert.equal(
    attempts,
    3,
    "Failed collection and primary fallback remain retryable",
  );
});

test("media excludes blocked promos, duplicates and untrusted image hosts", () => {
  const body = {
    data: {
      promo: [
        {
          title: "Blocked",
          trailer: { youtube_id: "aaaaaaaaaaa", embeddable: false },
        },
        {
          title: "Private",
          trailer: { youtube_id: "bbbbbbbbbbb", privacy_status: "private" },
        },
        {
          title: "PV",
          trailer: { region_restriction: null, youtube_id: "ccccccccccc" },
        },
        {
          title: "Same PV",
          trailer: { region_restriction: null, youtube_id: "ccccccccccc" },
        },
      ],
    },
  };
  assert.deepEqual(normalizePromos(body), {
    videoId: "ccccccccccc",
    trailers: [{ videoId: "ccccccccccc", title: "PV" }],
  });
  const image = "https://cdn.myanimelist.net/images/anime/1/2.jpg";
  assert.deepEqual(
    normalizePictures({
      data: [
        { jpg: { image_url: image } },
        { jpg: { image_url: image } },
        { jpg: { image_url: "https://evil.example/a.jpg" } },
        {
          jpg: {
            image_url:
              "https://cdn.myanimelist.net@evil.example/images/anime/1.jpg",
          },
        },
      ],
    }),
    { pictures: [{ image, thumbnail: image }] },
  );
  assert.equal(
    isPublicMetadataRequest(new Request("https://example.com/api/pictures/42")),
    true,
  );
  assert.equal(
    isPublicMetadataRequest(
      new Request("https://example.com/api/pictures/42", { method: "POST" }),
    ),
    false,
  );
});
test("pictures are cached independently and concurrent requests share a fetch", async () => {
  let calls = 0,
    release;
  const service = createTrailerService({
    fetcher: async (url) => {
      calls++;
      assert.match(url, /42\/pictures$/);
      await new Promise((r) => (release = r));
      return Response.json({ data: [] });
    },
  });
  const a = service.pictures(42),
    b = service.pictures(42);
  release();
  assert.deepEqual(await a, { pictures: [] });
  await b;
  await service.pictures(42);
  assert.equal(calls, 1);
});

test("pictures prefer a large WebP over a standard JPEG", () => {
  const small = "https://cdn.myanimelist.net/images/anime/4/19644.jpg";
  const large = "https://cdn.myanimelist.net/images/anime/4/19644l.webp";
  assert.deepEqual(
    normalizePictures({
      data: [{ jpg: { image_url: small }, webp: { large_image_url: large } }],
    }),
    { pictures: [{ image: large, thumbnail: small }] },
  );
});

test("an upstream 404 is retryable, not cached as absent media", async () => {
  let calls = 0;
  const service = createTrailerService({
    fetcher: async () =>
      ++calls === 1
        ? new Response("Not found", { status: 404 })
        : Response.json({
            data: {
              promo: [
                {
                  title: "PV",
                  trailer: {
                    youtube_id: "abcdefghijk",
                    region_restriction: null,
                  },
                },
              ],
            },
          }),
  });
  await assert.rejects(service.get(77));
  assert.equal((await service.get(77)).trailers.length, 1);
  assert.equal(calls, 3);
});

test("failed video collections recover the actual primary trailer without dropping region restrictions", async () => {
  const calls = [],
    stored = [];
  const service = createTrailerService({
    publicStore: { get: () => null, set: (_, entry) => stored.push(entry) },
    fetcher: async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, "manual");
      if (url.endsWith("/videos")) return new Response("", { status: 503 });
      assert.equal(url, "https://api.tenrai.org/v1/anime/123/full");
      return Response.json({
        data: {
          trailer: {
            youtube_id: "abcdefghijk",
            title: "Actual PV",
            region_restriction: { allowed: ["US"] },
            embeddable: true,
          },
        },
      });
    },
  });
  const data = await service.get(123, "US");
  assert.equal(data.videoId, "abcdefghijk");
  assert.equal(data.trailers[0].title, "Actual PV");
  assert.equal(data.partial, true);
  assert.equal((await service.get(123, "JP")).trailers.length, 0);
  assert.equal((await service.get(123)).trailers.length, 0);
  assert.equal(
    calls.length,
    2,
    "Primary fallback shares cache and pending work",
  );
  assert.ok(
    stored[0].expires <= Date.now() + 60000,
    "Partial lists must not hide the full collection for a day",
  );
});

test("a primary trailer fallback never invents a video or accepts a forbidden embed", async () => {
  for (const trailer of [
    null,
    { youtube_id: "javascript:foo" },
    { youtube_id: "abcdefghijk", embeddable: false },
    { youtube_id: "abcdefghijk", privacy_status: "private" },
  ]) {
    const service = createTrailerService({
      fetcher: async (url) =>
        url.endsWith("/videos")
          ? new Response("", { status: 503 })
          : Response.json({ data: { trailer } }),
    });
    await assert.rejects(service.get(124, "US"));
  }
});
