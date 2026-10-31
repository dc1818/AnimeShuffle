import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
import { seedRecommendationHistory } from "./recommendation-fixture.mjs";
import { cachedArtwork } from "../src/lib/media-artwork.js";

test("recommendations warm covers before publishing and wait for their decode", async () => {
  const values = new Map();
  const store = createAnimeStore({
    staticMode: true,
    storage: {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    },
  });
  await store.initialize();
  await store.savePreferences({ favoriteGenres: ["Action"] });
  seedRecommendationHistory(store);
  const original = { window: globalThis.window, document: globalThis.document };
  let release = false,
    done = false;
  const images = [];
  globalThis.document = { documentElement: { dataset: { hosting: "pages" } } };
  globalThis.window = {
    Image: class {
      naturalWidth = 300;
      constructor() {
        images.push(this);
      }
      set src(value) {
        this.url = value;
        if (release) queueMicrotask(() => this.onload?.());
      }
      removeAttribute() {}
      decode() {
        return Promise.resolve();
      }
    },
  };
  let loading;
  try {
    loading = store.loadRecommendations().then(() => {
      done = true;
    });
    for (let i = 0; i < 100 && !images.length; i++)
      await new Promise((r) => setTimeout(r, 1));
    assert.ok(images.length > 0, "Artwork starts before the shortlist appears");
    assert.equal(done, false);
    assert.equal(store.getSnapshot().recommendationPicks.length, 0);
    release = true;
    images.forEach((image) => image.onload?.());
    await loading;
    const state = store.getSnapshot();
    assert.ok(state.recommendationPicks.length > 0);
    assert.ok(
      state.recommendationPicks.every(
        ({ anime }) => cachedArtwork(anime.image)?.source,
      ),
    );
    assert.equal(state.recommendationsLoading, false);
  } finally {
    release = true;
    images.forEach((image) => image.onload?.());
    await loading;
    Object.assign(globalThis, original);
  }
});
