import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

test("no card/exposure before cover decode and preview; switching and silent fallback recovery are safe", async () => {
  const dir = await mkdtemp(path.resolve(".react-test-"));
  const outfile = path.join(dir, "gate.mjs");
  await build({
    entryPoints: ["src/components/MediaReady.jsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { MediaReady } = await import(pathToFileURL(outfile));
  const dom = new JSDOM('<div id="root"></div>');
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const images = [],
    requests = new Map();
  window.Image = class {
    naturalWidth = 300;
    constructor() {
      images.push(this);
    }
    removeAttribute() {}
    decode() {
      return new Promise((resolve) => {
        this.decoded = resolve;
      });
    }
  };
  globalThis.fetch = (url) =>
    new Promise((resolve) => requests.set(url, resolve));
  const root = createRoot(document.getElementById("root"));
  let skips = 0;
  const render = (id) =>
    root.render(
      React.createElement(
        MediaReady,
        {
          anime: {
            id,
            image: `https://cdn.myanimelist.net/images/anime/1/${id}.jpg`,
          },
          onSkip: () => skips++,
        },
        React.createElement("article", null, `Card ${id}`),
      ),
    );
  const metadata = (id) =>
    requests.get(`/api/trailer/${id}`)(
      Response.json({ videoId: null, trailers: [] }),
    );
  try {
    await act(async () => render(910001));
    assert.equal(document.querySelector("article"), null);
    await act(async () => images[0].onload());
    await act(async () => metadata(910001));
    assert.equal(
      document.querySelector("article"),
      null,
      "download is not decode",
    );
    await act(async () => images[0].decoded());
    assert.equal(document.querySelector("article").textContent, "Card 910001");
    await act(async () => render(910002));
    assert.equal(
      document.querySelector("article"),
      null,
      "old readiness cannot reveal a new anime",
    );
    await act(async () => render(910003));
    await act(async () => {
      images[1].onload();
      metadata(910002);
    });
    await act(async () => images[1].decoded());
    assert.equal(
      document.querySelector("article"),
      null,
      "stale request cannot reveal current card",
    );
    await act(async () => images[2].onerror());
    assert.equal(document.querySelector("article"), null);
    assert.doesNotMatch(
      document.body.textContent,
      /could not load|couldn.t load|Retry|Skip/,
    );
    await act(async () => {
      images[3].onload();
      metadata(910003);
    });
    assert.equal(
      document.querySelector("article"),
      null,
      "Alternate image still must decode",
    );
    await act(async () => images[3].decoded());
    assert.equal(document.querySelector("article").textContent, "Card 910003");
    await act(async () => render(910004));
    await act(async () => {
      images[4].onerror();
      images[5].onerror();
      metadata(910004);
    });
    assert.equal(
      document.querySelector("article").textContent,
      "Card 910004",
      "Native fallback cannot strand the card",
    );
    assert.equal(skips, 0, "Recovery preserves the recommended anime");
    assert.doesNotMatch(
      document.body.textContent,
      /could not load|couldn.t load|Retry/,
    );
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, original);
    dom.window.close();
    await rm(dir, { recursive: true, force: true });
  }
});
