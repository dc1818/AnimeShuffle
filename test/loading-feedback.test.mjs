import { resolvedMedia } from "./media-fixture.mjs";
import { seedRecommendationHistory } from "./recommendation-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { createAnimeStore } from "../src/lib/store.js";

test("loaded feeds explain shared waits and retain their existing picks", async () => {
  const dir = await mkdtemp(path.resolve(".react-test-loading-"));
  const dom = new JSDOM("<html></html>", { url: "http://localhost/" });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const restoreMedia = resolvedMedia(dom.window);
  try {
    await build({
      entryPoints: ["src/App.jsx", "src/components/Recommendations.jsx", "src/lib/card-media.js"],
      outdir: dir,
      bundle: true,
      splitting: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      packages: "external",
      outExtension: { ".js": ".mjs" },
    });
    const { App } = await import(pathToFileURL(path.join(dir, "App.mjs")));
    const { Recommendations } = await import(
      pathToFileURL(path.join(dir, "components/Recommendations.mjs"))
    );
    const store = createAnimeStore({
      staticMode: true,
      storage: { getItem: () => null, setItem() {} },
    });
    await store.initialize();
    await store.savePreferences({ favoriteGenres: ["Action"] });
    seedRecommendationHistory(store);
    await store.loadRecommendations();
    const original = store.getSnapshot();
    const { prepareCardMedia } = await import(pathToFileURL(path.join(dir, "lib/card-media.mjs")));
    await Promise.all([original.current, ...original.recommendationPicks.map(pick => pick.anime)].map(prepareCardMedia));
    const current = original.current;
    const picks = original.recommendationPicks;
    for (const [Component, extra, label] of [
      [
        App,
        { recommendationsLoading: true },
        "Calculating your recommendations",
      ],
      [
        Recommendations,
        { discoveryLoading: true },
        "Finding your next Discover pick",
      ],
      [
        Recommendations,
        { busyMessage: "Undoing your choice…" },
        "Undoing your choice",
      ],
    ]) {
      const state = { ...original, ...extra, busy: true };
      const html = renderToStaticMarkup(
        React.createElement(Component, {
          state,
          store: { ...store, getSnapshot: () => state },
        }),
      );
      assert.match(html, /role="progressbar"/);
      assert.ok(html.includes(label));
      assert.match(html, /class="reaction good" disabled/);
      assert.equal(state.current, current);
      assert.equal(state.recommendationPicks, picks);
    }
    for (const Component of [App, Recommendations]) {
      const state = { ...original, busy: true, watchlistSaving: true };
      const html = renderToStaticMarkup(
        React.createElement(Component, {
          state,
          store: { ...store, getSnapshot: () => state },
        }),
      );
      assert.doesNotMatch(html, /role="progressbar"/);
      assert.doesNotMatch(html, /Saving to|Saving your|id="toast"/);
      assert.match(html, /class="reaction good" disabled/);
    }
    const idle = renderToStaticMarkup(
      React.createElement(Recommendations, { state: original, store }),
    );
    assert.doesNotMatch(idle, /role="progressbar"/);
    assert.doesNotMatch(idle, /class="reaction good" disabled/);
  } finally {
    restoreMedia();
    delete globalThis.document;
    delete globalThis.window;
    dom.window.close();
    await rm(dir, { recursive: true, force: true });
  }
});
