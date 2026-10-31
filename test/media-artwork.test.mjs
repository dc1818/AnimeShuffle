import test from "node:test";
import assert from "node:assert/strict";
import { prepareArtwork, cachedArtwork } from "../src/lib/media-artwork.js";

test("bounded background covers leave foreground capacity; decode and fallback use a finite budget", async () => {
  const original = globalThis.window;
  const images = [];
  globalThis.window = {
    Image: class {
      naturalWidth = 300;
      constructor() {
        images.push(this);
      }
      removeAttribute() {}
      decode() {
        return Promise.resolve();
      }
    },
  };
  try {
    const low = [1, 2, 3, 4].map((id) =>
      prepareArtwork(`https://cdn.myanimelist.net/images/anime/99/${id}.jpg`, {
        priority: "low",
      }),
    );
    assert.equal(images.length, 3);
    const urgentUrl = "https://cdn.myanimelist.net/images/anime/99/5.jpg";
    const urgent = prepareArtwork(urgentUrl);
    assert.equal(
      images.length,
      4,
      "Foreground work starts without waiting for the warm queue",
    );
    assert.equal(prepareArtwork(urgentUrl), urgent);
    images[3].onload();
    await urgent;
    assert.ok(cachedArtwork(urgentUrl).source);
    assert.equal(images.length, 4, "Only three background jobs run at once");
    images[0].onload();
    await low[0];
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(images.length, 5);
    for (const i of [1, 2, 4]) images[i].onload();
    await Promise.all(low);
    const slow = await prepareArtwork(
      "https://cdn.myanimelist.net/images/anime/99/6.jpg",
      { timeoutMs: 5 },
    );
    assert.equal(
      slow.source,
      null,
      "A stalled image resolves to the native fallback",
    );
    const decoding = prepareArtwork(
      "https://cdn.myanimelist.net/images/anime/99/7.jpg",
      { timeoutMs: 5 },
    );
    images.at(-1).decode = () => new Promise(() => {});
    images.at(-1).onload();
    assert.equal(
      (await decoding).source,
      null,
      "A stalled decode has the same bounded fallback",
    );
  } finally {
    globalThis.window = original;
  }
});
