import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
test("preview is lazy, closes cleanly, and switching anime cancels a pending preview", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const outfile = path.join(folder, "Trailer.mjs");
  await build({
    entryPoints: ["src/components/TrailerPreview.jsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { TrailerPreview } = await import(pathToFileURL(outfile));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://shuffle.example",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const original = globalThis.fetch;
  let calls = 0,
    signal,
    release;
  globalThis.fetch = async (_, options) => {
    calls++;
    signal = options.signal;
    if (calls > 1) await new Promise((r) => (release = r));
    return Response.json({ videoId: "abcdefghijk" });
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const render = (id) =>
    root.render(
      React.createElement(TrailerPreview, {
        key: id,
        anime: { id, title: "Anime " + id },
      }),
    );
  try {
    await act(async () => render(1));
    assert.equal(calls, 0);
    assert.equal(document.querySelector("iframe"), null);
    await act(async () => document.querySelector(".watch-preview").click());
    assert.equal(calls, 1);
    assert.match(
      document.querySelector("iframe").src,
      /^https:\/\/www.youtube-nocookie.com\/embed\/abcdefghijk/,
    );
    assert.equal(
      document.querySelector("iframe").getAttribute("referrerpolicy"),
      "strict-origin-when-cross-origin",
    );
    await act(async () =>
      document.querySelector(".trailer-toolbar button").click(),
    );
    assert.equal(document.querySelector("iframe"), null);
    await act(async () => render(2));
    await act(async () => document.querySelector(".watch-preview").click());
    await act(async () => render(3));
    assert.equal(signal.aborted, true);
    await act(async () => release());
    assert.equal(document.querySelector("iframe"), null);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = original;
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
