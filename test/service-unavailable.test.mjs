import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("outage replaces the entire app including navigation and onboarding", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  try {
    const outfile = path.join(folder, "App.mjs");
    await build({
      entryPoints: ["src/App.jsx"],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      packages: "external",
    });
    const { App } = await import(pathToFileURL(outfile));
    let state = { ready: true, backendUnavailable: true };
    const store = { subscribe: () => () => {}, getSnapshot: () => state };
    const html = renderToStaticMarkup(React.createElement(App, { store }));
    assert.match(html, /Taking an intermission/);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /Main navigation|<dialog|anime-card/);
    state = { ready: false, backendUnavailable: false };
    const pending = renderToStaticMarkup(React.createElement(App, { store }));
    assert.match(pending, /Connecting to Anime Shuffle/);
    assert.doesNotMatch(pending, /Main navigation|<dialog/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
