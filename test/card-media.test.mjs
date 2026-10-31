import test from "node:test";
import assert from "node:assert/strict";
import { prepareCardMedia, cardMediaReady } from "../src/lib/card-media.js";
test("a card waits for decoded cover and preview; errors remain retryable and valid no-trailer results can display", async () => {
  const old = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
  };
  const images = [];
  let release;
  globalThis.window = {
    Image: class {
      constructor() {
        images.push(this);
        this.naturalWidth = 300;
      }
      removeAttribute() {}
      decode() {
        return Promise.resolve();
      }
    },
  };
  globalThis.document = { documentElement: { dataset: {} } };
  globalThis.fetch = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const anime = {
    id: 987654,
    image: "https://cdn.myanimelist.net/images/anime/1/2.jpg",
  };
  try {
    const job = prepareCardMedia(anime);
    assert.equal(prepareCardMedia(anime), job);
    await images[0].onload();
    assert.equal(cardMediaReady(anime), false, "cover alone is not enough");
    release(Response.json({ videoId: null, trailers: [] }));
    await job;
    assert.equal(cardMediaReady(anime), true);
    const failed = { ...anime, id: 987655 };
    globalThis.fetch = async () =>
      Response.json({ videoId: null, trailers: [] });
    const failure = prepareCardMedia(failed);
    images[1].onerror();
    await assert.rejects(failure, /cover/);
    assert.equal(cardMediaReady(failed), false);
    const retry = prepareCardMedia(failed);
    await images[2].onload();
    await retry;
    assert.equal(cardMediaReady(failed), true);
  } finally {
    Object.assign(globalThis, old);
  }
});
