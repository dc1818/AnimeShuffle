import test from "node:test";
import assert from "node:assert/strict";
import { paletteFromPixels } from "../src/lib/cover-palette.js";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("cover palette retains blue, finds representative colors and ignores transparent/white pixels", () => {
  const pixels = [
    ...Array(20).fill([180, 40, 60, 255]),
    ...Array(10).fill([40, 70, 210, 255]),
    [20, 255, 20, 0],
    [255, 255, 255, 255],
  ].flat();
  assert.deepEqual(paletteFromPixels(pixels), ["180, 40, 60", "40, 70, 210"]);
  assert.deepEqual(paletteFromPixels([40, 70, 210, 255]), [
    "40, 70, 210",
    "40, 70, 210",
  ]);
  assert.deepEqual(paletteFromPixels([110, 110, 110, 255]), [
    "110, 110, 110",
    "110, 110, 110",
  ]);
  assert.equal(paletteFromPixels([255, 255, 255, 0]), null);
  assert.equal(
    paletteFromPixels(
      [
        ...Array(100).fill([200, 200, 200, 255]),
        ...Array(10).fill([40, 70, 210, 255]),
      ].flat(),
    )[0],
    "40, 70, 210",
    "Gray borders do not drown out the cover's blue accent",
  );
});

test("dynamic background updates for new covers, cached covers and expanded recommendation cards", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const outfile = path.join(folder, "Card.mjs");
  await build({
    entryPoints: ["src/components/AnimeCard.jsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { AnimeCard } = await import(pathToFileURL(outfile));
  const dom = new JSDOM(
    '<html data-hosting="pages"><body><div id="root"></div></body></html>',
    { url: "https://shuffle.example" },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let color = [40, 70, 210, 255];
  window.HTMLCanvasElement.prototype.getContext = () => ({
    drawImage() {},
    getImageData: () => ({ data: color }),
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const render = (id, dynamic = true, compact = false) =>
    root.render(
      React.createElement(AnimeCard, {
        anime: {
          id,
          title: "Anime",
          image: `https://cdn.myanimelist.net/images/anime/${id}/1.jpg`,
          genres: [],
        },
        dynamic,
        compact,
      }),
    );
  const cool = () => document.body.style.getPropertyValue("--cool");
  try {
    await act(async () => render(1));
    await act(async () =>
      document
        .querySelector("img.poster")
        .dispatchEvent(new window.Event("load")),
    );
    assert.equal(cool(), "40, 70, 210");
    color = [190, 60, 30, 255];
    await act(async () => render(2));
    assert.notEqual(
      cool(),
      "40, 70, 210",
      "Previous anime's palette cannot leak onto a new cover",
    );
    await act(async () =>
      document
        .querySelector("img.poster")
        .dispatchEvent(new window.Event("load")),
    );
    assert.equal(cool(), "190, 60, 30");
    await act(async () => render(2, false));
    assert.equal(cool(), "20, 55, 70");
    assert.equal(document.body.style.getPropertyValue("--anime-cover"), "none");
    Object.defineProperty(window.HTMLImageElement.prototype, "complete", {
      get: () => true,
      configurable: true,
    });
    Object.defineProperty(window.HTMLImageElement.prototype, "naturalWidth", {
      get: () => 100,
      configurable: true,
    });
    color = [35, 160, 85, 255];
    await act(async () => render(3, true, true));
    assert.equal(
      cool(),
      "35, 160, 85",
      "Cached recommendation cover updates without a new load event",
    );
    assert.match(
      document.body.style.getPropertyValue("--anime-cover"),
      /anime\/3\//,
    );
    window.HTMLCanvasElement.prototype.getContext = () => {
      throw Error("Canvas access blocked");
    };
    await act(async () => render(4, true, true));
    assert.match(
      document.body.style.getPropertyValue("--anime-cover"),
      /anime\/4\//,
      "The background still follows the current cover if canvas is blocked",
    );
    await act(async () =>
      document
        .querySelector("img.poster")
        .dispatchEvent(new window.Event("error")),
    );
    assert.equal(
      document.body.style.getPropertyValue("--anime-cover"),
      "none",
      "A failed cover never leaves the previous anime's artwork",
    );
  } finally {
    await act(async () => root.unmount());
    assert.equal(document.body.style.getPropertyValue("--anime-cover"), "");
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
