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
for (const staticMode of [false, true])
  test(`React interface preserves onboarding and discovery (${staticMode ? "Pages" : "server"})`, async () => {
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
      url: staticMode
        ? "https://dc1818.github.io/AnimeShuffle/"
        : "http://localhost:5173",
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
    if (staticMode) document.documentElement.dataset.hosting = "pages";
    dom.window.HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    dom.window.HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
    const store = createAnimeStore({
      storage: localStorage,
      staticMode,
      request: async () => {
        assert.equal(staticMode, false, "Pages must not call server endpoints");
        return new Response(
          JSON.stringify({
            configured: false,
            connected: false,
            csrf: "fixture",
          }),
        );
      },
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
        document.getElementById("anime-title"),
        null,
        "No cards before onboarding",
      );
      if (staticMode) {
        assert.equal(document.querySelector('a[href="/auth/start"]'), null);
        assert.equal(button("Create an Anime Shuffle account"), undefined);
        assert.equal(
          document.querySelector(".brand").href,
          "https://dc1818.github.io/AnimeShuffle/",
        );
        assert.equal(
          document.querySelector(".brand img").src,
          "https://dc1818.github.io/AnimeShuffle/assets/logo.png",
        );
        await click("Start shuffling");
      } else {
        assert.ok(
          document.querySelector(
            'a[href="https://myanimelist.net/register.php"]',
          ),
        );
        assert.ok(document.querySelector('a[href="/auth/start"]'));
        assert.ok(button("Create an Anime Shuffle account"));
        await click("Try without logging in");
      }
      assert.ok(document.querySelector("dialog[open]"));
      assert.ok(button("Start shuffling"));
      await click("Start shuffling");
      assert.equal(document.querySelector("dialog"), null);
      assert.equal(
        document.getElementById("anime-title").textContent,
        "Cowboy Bebop",
      );
      if (staticMode)
        assert.ok(
          document
            .querySelector(".poster")
            .src.startsWith("https://cdn.myanimelist.net/"),
        );
      await click("More about this anime");
      assert.ok(document.getElementById("details-card"));
      await click("Hide details");
      assert.equal(document.getElementById("details-card"), null);
      // Keyboard numbers are present in button text, so dispatch by class for reactions.
      await act(async () => document.querySelector(".reaction.watch").click());
      assert.equal(store.getSnapshot().reactions[1].action, "watch");
      await click("Recommendations");
      // MAL-free demo must rank the saved pick plus six other sample titles.
      await act(async () => {});
      assert.equal(document.querySelectorAll(".ranked-card").length, 7);
      assert.match(
        document.querySelector(".tier-badge").textContent,
        /Gold · Tier 1/,
      );
      assert.equal(document.querySelectorAll(".medal-1").length, 1);
      assert.equal(
        document.querySelectorAll(".ranked-card .reaction").length,
        28,
      );
      await act(async () =>
        document.querySelector(".ranked-card .details-toggle").click(),
      );
      assert.ok(document.getElementById("details-card"));
      const firstId = Number(
        document
          .querySelector(".ranked-card .details-toggle")
          .id.split("-")
          .pop(),
      );
      await act(async () =>
        document.querySelector(".ranked-card .reaction.nope").click(),
      );
      assert.equal(store.getSnapshot().reactions[firstId].action, "nope");
      assert.equal(document.querySelectorAll(".ranked-card").length, 6);
      await click("Undo last reaction");
      assert.equal(document.querySelectorAll(".ranked-card").length, 7);

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
      await act(async () =>
        document.querySelector('[aria-label="Open settings"]').click(),
      );
      await click("Viewing preferences");
      await act(async () =>
        [...document.querySelectorAll(".preference-option")]
          .find((element) => element.textContent.startsWith("Movies"))
          .click(),
      );
      await click("Start shuffling");
      assert.equal(store.getSnapshot().current.format, "movie");
      assert.ok(
        document
          .querySelector(".runtime-estimate")
          .textContent.includes("total"),
      );
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      await rm(folder, { recursive: true, force: true });
    }
  });
