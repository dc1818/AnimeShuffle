import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("recommendation exposure records visible rows only, once, and ignores hidden tabs", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-")),
    outfile = path.join(folder, "exposure.mjs");
  await build({
    entryPoints: ["src/components/RecommendationExposure.jsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { RecommendationExposure } = await import(pathToFileURL(outfile));
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let callback,
    observed,
    disconnected = false;
  let visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    get: () => visibility,
    configurable: true,
  });
  globalThis.IntersectionObserver = class {
    constructor(fn) {
      callback = fn;
    }
    observe(el) {
      observed = el;
    }
    disconnect() {
      disconnected = true;
    }
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const events = [];
  try {
    await act(async () =>
      root.render(
        React.createElement(
          RecommendationExposure,
          {
            animeId: 7,
            surface: "recommendations",
            position: 3,
            onSeen: (...args) => events.push(args),
          },
          "Title",
        ),
      ),
    );
    assert.equal(events.length, 0);
    assert.equal(observed.textContent, "Title");
    callback([{ isIntersecting: false }]);
    assert.equal(events.length, 0);
    visibility = "hidden";
    callback([{ isIntersecting: true }]);
    assert.equal(events.length, 0);
    visibility = "visible";
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
    callback([{ isIntersecting: true }]);
    assert.deepEqual(events, [
      [7, { surface: "recommendations", position: 3 }],
    ]);
  } finally {
    await act(async () => root.unmount());
    assert.equal(disconnected, true);
    delete globalThis.IntersectionObserver;
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
