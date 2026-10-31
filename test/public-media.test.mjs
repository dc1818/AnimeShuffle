import test from "node:test";
import assert from "node:assert/strict";
import { loadPublicMedia } from "../src/lib/public-media.js";
import { prepareMedia, cachedMedia } from "../src/lib/media-cache.js";
const promos = {
  data: {
    promo: [
      {
        title: "US",
        trailer: {
          youtube_id: "aaaaaaaaaaa",
          region_restriction: { allowed: ["US"] },
        },
      },
      {
        title: "Japan",
        trailer: {
          youtube_id: "bbbbbbbbbbb",
          region_restriction: { allowed: ["JP"] },
        },
      },
      {
        title: "World",
        trailer: { youtube_id: "ccccccccccc", region_restriction: null },
      },
      { title: "Unknown", trailer: { youtube_id: "ddddddddddd" } },
      {
        title: "Private",
        trailer: {
          youtube_id: "eeeeeeeeeee",
          region_restriction: null,
          privacy_status: "private",
        },
      },
      {
        title: "Not embeddable",
        trailer: {
          youtube_id: "fffffffffff",
          region_restriction: null,
          embeddable: false,
        },
      },
      {
        title: "Bad",
        trailer: {
          youtube_id: "https://bad.example",
          region_restriction: null,
        },
      },
    ],
  },
};
test("public fallback preserves regional, embed and video-ID checks", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/api.tenrai.org\/v1\/anime\/\d+\/videos$/);
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.deepEqual(options.headers, { Accept: "application/json" });
    return Response.json(promos);
  };
  try {
    assert.deepEqual(
      (await loadPublicMedia(1, "trailer", "US")).trailers.map((t) => t.title),
      ["US", "World"],
    );
    assert.deepEqual(
      (await loadPublicMedia(1, "trailer", "JP")).trailers.map((t) => t.title),
      ["Japan", "World"],
    );
    assert.deepEqual(
      (await loadPublicMedia(1, "trailer", null)).trailers.map((t) => t.title),
      ["World"],
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("a throttled server recovers real media from the public API and shares the successful cache", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    if (url.startsWith("/api/"))
      return Response.json(
        { code: "media_rate_limited", mediaCountry: "US" },
        { status: 429, headers: { "Retry-After": "45" } },
      );
    return Response.json(promos);
  };
  try {
    const anime = { id: 991199 };
    const [a, b] = await Promise.all([
      prepareMedia(anime),
      prepareMedia(anime),
    ]);
    assert.equal(a.videoId, "aaaaaaaaaaa");
    assert.equal(b, a);
    assert.equal(a.fallback, undefined);
    assert.equal(cachedMedia(anime.id), a);
    assert.equal(calls.length, 2);
    assert.equal(calls[1], "https://api.tenrai.org/v1/anime/991199/videos");
    await prepareMedia(anime);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test("public artwork fallback retains the image host allowlist and rejects arbitrary endpoints", async () => {
  const original = globalThis.fetch;
  const image = "https://cdn.myanimelist.net/images/anime/1/2.jpg";
  globalThis.fetch = async () =>
    Response.json({
      data: [
        { jpg: { large_image_url: image } },
        { jpg: { image_url: "https://evil.example/image.jpg" } },
      ],
    });
  try {
    assert.deepEqual((await loadPublicMedia(2, "pictures", null)).pictures, [
      { image, thumbnail: image },
    ]);
    await assert.rejects(loadPublicMedia("../secret", "trailer", "US"));
    await assert.rejects(loadPublicMedia(1, "user", "US"));
  } finally {
    globalThis.fetch = original;
  }
});
