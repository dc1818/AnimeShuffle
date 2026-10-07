import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrailerResponse,
  trailerThumbnail,
} from "../src/lib/media-data.js";
import { loadMedia } from "../src/lib/media-cache.js";
import { validProxyImage } from "../lib/media-images.mjs";
import { validImage } from "../lib/mal.mjs";

test("old and current trailer responses work, and a bad entry cannot hide valid media", () => {
  assert.deepEqual(normalizeTrailerResponse({ videoId: "abcdefghijk" }), {
    videoId: "abcdefghijk",
    trailers: [{ videoId: "abcdefghijk", title: "Preview" }],
  });
  assert.deepEqual(normalizeTrailerResponse({ videoId: null }), {
    videoId: null,
    trailers: [],
  });
  const data = normalizeTrailerResponse({
    trailers: [
      { videoId: "bad" },
      null,
      { videoId: "abcdefghijk", title: "PV" },
      { videoId: "abcdefghijk" },
    ],
  });
  assert.equal(data.trailers.length, 1);
  assert.equal(data.videoId, "abcdefghijk");
  assert.throws(() => normalizeTrailerResponse({}), /couldn’t load/);
  assert.throws(() =>
    normalizeTrailerResponse({ trailers: [{ videoId: "javascript:foo" }] }),
  );
});
test("one automatic retry recovers malformed/transient responses and is shared by all consumers", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () =>
    ++calls === 1
      ? Response.json({})
      : Response.json({ videoId: "abcdefghijk" });
  try {
    const one = loadMedia(918201),
      two = loadMedia(918201);
    assert.equal(one, two);
    assert.equal((await one).videoId, "abcdefghijk");
    assert.equal((await two).videoId, "abcdefghijk");
    assert.equal(calls, 2);
    await loadMedia(918201);
    assert.equal(calls, 2);
    globalThis.fetch = async () => {
      calls++;
      return new Response("", { status: 403 });
    };
    await assert.rejects(loadMedia(918202));
    assert.equal(calls, 3, "Permission errors are not repeatedly retried");
    globalThis.fetch = async () => {
      calls++;
      return new Response("", { status: 503 });
    };
    await assert.rejects(loadMedia(918203));
    assert.equal(calls, 5, "Retry stops after one attempt");
  } finally {
    globalThis.fetch = original;
  }
});
test("thumbnail proxy permits only fixed YouTube thumbnail paths; cover validation stays strict", () => {
  const thumb = trailerThumbnail("abcdefghijk");
  assert.equal(validProxyImage(thumb), true);
  assert.equal(validImage(thumb), false);
  assert.equal(trailerThumbnail("/etc/passwd"), null);
  for (const url of [
    "https://i.ytimg.com.evil.example/vi/abcdefghijk/mqdefault.jpg",
    "https://i.ytimg.com@evil.example/vi/abcdefghijk/mqdefault.jpg",
    "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg?redirect=evil",
    "https://i.ytimg.com:8080/vi/abcdefghijk/mqdefault.jpg",
    "https://i.ytimg.com/anything-else.jpg",
  ])
    assert.equal(validProxyImage(url), false);
});
