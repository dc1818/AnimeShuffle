import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

test("100 superseding cards never expose stale media, even when earlier decodes finish later", async () => {
  const dir = await mkdtemp(path.resolve(".react-test-"));
  await build({
    entryPoints: ["src/components/MediaReady.jsx"],
    outfile: path.join(dir, "gate.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { MediaReady } = await import(
    pathToFileURL(path.join(dir, "gate.mjs"))
  );
  const dom = new JSDOM('<div id="root"></div>');
  const old = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const decodes = [];
  let released = false;
  window.Image = class {
    naturalWidth = 300;
    set src(value) {
      queueMicrotask(() => this.onload?.());
    }
    removeAttribute() {}
    decode() {
      return released
        ? Promise.resolve()
        : new Promise((resolve) => decodes.push(resolve));
    }
  };
  globalThis.fetch = async () => Response.json({ videoId: null, trailers: [] });
  const root = createRoot(document.getElementById("root")),
    displayed = [];
  try {
    for (let i = 0; i < 100; i++) {
      const id = 920000 + i;
      await act(async () =>
        root.render(
          React.createElement(
            MediaReady,
            {
              anime: {
                id,
                image: `https://cdn.myanimelist.net/images/anime/1/${id}.jpg`,
              },
              onReady: (id) => displayed.push(id),
            },
            React.createElement("article", null, String(id)),
          ),
        ),
      );
      assert.equal(
        document.querySelector("article"),
        null,
        "pending card must stay hidden",
      );
    }
    assert.deepEqual(displayed, []);
    // The image queue is bounded. Resolving the active jobs drains every queued
    // decode, including requests belonging to cards that have already unmounted.
    released = true;
    await act(async () => {
      decodes.reverse().forEach((resolve) => resolve());
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(document.querySelector("article")?.textContent, "920099");
    assert.deepEqual(displayed, [920099]);
    assert.doesNotMatch(
      document.body.textContent,
      /couldn.t load|please try again/i,
    );
  } finally {
    released = true;
    decodes.forEach((resolve) => resolve());
    await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, old);
    await rm(dir, { recursive: true, force: true });
  }
});
