import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createAnimeStore } from "../src/lib/store.js";

// Render real React components in jsdom. Native dialog/canvas layout still needs
// a real browser; the dialog methods below only emulate opening/closing for events.
test("React interface preserves onboarding, details, four reactions, watchlist and Undo", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
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
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost:5173",
  });
  for (const name of [
    "window",
    "document",
    "location",
    "sessionStorage",
    "localStorage",
  ])
    globalThis[name] = dom.window[name];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const store = createAnimeStore({
    storage: localStorage,
    request: async () =>
      new Response(
        JSON.stringify({
          configured: false,
          connected: false,
          csrf: "fixture",
        }),
      ),
  });
  const root = createRoot(document.getElementById("root"));
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    );
  async function click(text) {
    const element = button(text);
    assert.ok(element, `Missing button: ${text}`);
    await act(async () => element.click());
  }
  try {
    await act(async () => {
      root.render(React.createElement(App, { store }));
      await store.initialize();
    });
    assert.equal(
      document.getElementById("anime-title").textContent,
      "Cowboy Bebop",
    );
    assert.ok(document.querySelector("dialog[open]"));
    await click("Try without logging in");
    assert.equal(document.querySelector("dialog"), null);
    await click("More about this anime");
    assert.ok(document.getElementById("details-card"));
    await click("Hide details");
    assert.equal(document.getElementById("details-card"), null);
    // Keyboard numbers are present in button text, so dispatch by class for reactions.
    await act(async () => document.querySelector(".reaction.watch").click());
    assert.equal(store.getSnapshot().reactions[1].action, "watch");
    await act(async () =>
      [...document.querySelectorAll("nav button")][1].click(),
    );
    assert.equal(document.querySelectorAll(".saved-card").length, 1);
    await click("Discover");
    await click("Undo");
    assert.equal(
      document.getElementById("anime-title").textContent,
      "Cowboy Bebop",
    );
    assert.equal(Object.keys(store.getSnapshot().reactions).length, 0);
    for (const action of ["good", "bad", "nope"]) {
      await act(async () =>
        document.querySelector(".reaction." + action).click(),
      );
      assert.equal(store.getSnapshot().reactions[1].action, action);
      await click("Undo");
    }
    await click("Skip");
    assert.notEqual(
      document.getElementById("anime-title").textContent,
      "Cowboy Bebop",
    );
    await click("Undo");
    assert.equal(
      document.getElementById("anime-title").textContent,
      "Cowboy Bebop",
    );
    assert.equal(Object.keys(store.getSnapshot().reactions).length, 0);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
