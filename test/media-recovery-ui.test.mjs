import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

test("late trailers restore both the card preview and trailer list after provisional fallback", async () => {
  const dir = await mkdtemp(path.resolve(".react-test-"));
  const outfile = path.join(dir, "recovery.mjs");
  await build({
    stdin: {
      contents: `
    export {MediaReady} from './src/components/MediaReady.jsx';
    export {AnimeCard} from './src/components/AnimeCard.jsx';
    export {AnimeMedia} from './src/components/AnimeMedia.jsx';
    export {prepareCardMedia} from './src/lib/card-media.js';
  `,
      resolveDir: process.cwd(),
    },
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { MediaReady, AnimeCard, AnimeMedia, prepareCardMedia } = await import(
    pathToFileURL(outfile)
  );
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://shuffle.example",
  });
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.Image = class {
    naturalWidth = 300;
    set src(value) {
      queueMicrotask(() => this.onload?.());
    }
    removeAttribute() {}
    decode() {
      return Promise.resolve();
    }
  };
  window.YT = {
    Player: class {
      constructor(frame) {
        this.frame = frame;
      }
      mute() {}
      playVideo() {}
      pauseVideo() {}
      destroy() {
        this.frame.remove();
      }
    },
  };
  let release,
    calls = 0;
  globalThis.fetch = () => {
    calls++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const root = createRoot(document.getElementById("root"));
  const anime = {
    id: 998881,
    title: "Recovery test",
    genres: [],
    image: "https://cdn.myanimelist.net/images/anime/99/998881.jpg",
  };
  try {
    const preparing = prepareCardMedia(anime, { previewTimeoutMs: 5 });
    await act(async () =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            MediaReady,
            { anime },
            React.createElement(AnimeCard, {
              anime,
              onReact() {},
              onSkip() {},
            }),
          ),
          React.createElement(AnimeMedia, {
            anime,
            kind: "trailer",
            active: true,
          }),
        ),
      ),
    );
    await act(async () => {
      await preparing;
    });
    assert.ok(document.querySelector(".discover-card"));
    assert.equal(
      document.querySelector(".watch-preview").hidden,
      false,
      "Provisional absence must not remove the play control",
    );
    assert.equal(document.querySelector(".watch-preview").disabled, false);
    assert.equal(document.querySelector(".media-trailers"), null);
    await act(async () =>
      release(
        Response.json({
          videoId: "abcdefghijk",
          trailers: [
            { videoId: "abcdefghijk", title: "PV 1" },
            { videoId: "12345678901", title: "PV 2" },
          ],
        }),
      ),
    );
    const tiles = [...document.querySelectorAll(".media-trailers button")];
    assert.equal(
      tiles.length,
      2,
      "Late success replaces the fallback without closing/reopening details",
    );
    assert.ok(
      tiles.every((tile) => tile.disabled),
      "Thumbnail decode gate remains intact",
    );
    await act(async () => {
      for (const tile of tiles)
        tile.querySelector("img").dispatchEvent(new window.Event("load"));
    });
    assert.ok(tiles.every((tile) => !tile.disabled));
    await act(async () => document.querySelector(".watch-preview").click());
    assert.match(
      document.querySelector(".trailer-panel iframe").src,
      /abcdefghijk/,
    );
    await act(async () => tiles[1].click());
    assert.ok(
      [...document.querySelectorAll("iframe")].some((frame) =>
        frame.src.includes("12345678901"),
      ),
    );
    assert.equal(
      calls,
      1,
      "Card and details share the same lookup, including recovery",
    );
    assert.doesNotMatch(
      document.body.textContent,
      /couldn.t load|Retry media|Retry player/,
    );
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, original);
    dom.window.close();
    await rm(dir, { recursive: true, force: true });
  }
});
