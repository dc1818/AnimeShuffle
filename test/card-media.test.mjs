import test from "node:test";
import assert from "node:assert/strict";
import { prepareCardMedia, cardMediaReady } from "../src/lib/card-media.js";
test("a card waits for decoded cover and preview; failures recover to decoded alternate artwork or native fallback", async () => {
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
    const failed = {
      ...anime,
      id: 987655,
      image: anime.image.replace("2.jpg", "3.jpg"),
    };
    globalThis.fetch = async () => new Response("", { status: 403 });
    const failure = prepareCardMedia(failed);
    images[1].onerror();
    assert.equal(
      images[2].src,
      failed.image,
      "Proxy failure tries direct artwork",
    );
    assert.equal(cardMediaReady(failed), false);
    images[2].onload();
    const recovered = await failure;
    assert.equal(recovered.artwork.source, failed.image);
    assert.equal(recovered.preview.fallback, true);
    assert.equal(cardMediaReady(failed), true);
    const missing = {
      ...anime,
      id: 987656,
      image: anime.image.replace("2.jpg", "4.jpg"),
    };
    const fallback = prepareCardMedia(missing);
    images[3].onerror();
    images[4].onerror();
    assert.equal((await fallback).artwork.source, null);
    assert.equal(
      cardMediaReady(missing),
      true,
      "Native SVG is ready without a download",
    );
  } finally {
    Object.assign(globalThis, old);
  }
});
