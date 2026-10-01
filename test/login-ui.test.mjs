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

test("MAL callback opens preferences for a verified account and shows failures inside the login dialog", async () => {
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
    for (const success of [true, false]) {
      const dom = new JSDOM('<div id="root"></div>', {
        url:
          "https://shuffle.example/" +
          (success ? "?connected=1" : "?auth_error=token"),
      });
      for (const name of [
        "window",
        "document",
        "location",
        "localStorage",
        "sessionStorage",
      ])
        globalThis[name] = dom.window[name];
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      dom.window.HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
      };
      dom.window.HTMLDialogElement.prototype.close = function () {
        this.removeAttribute("open");
      };
      const account = success
        ? { id: "mal:7", name: "MALViewer", provider: "mal" }
        : null;
      const store = createAnimeStore({
        storage: localStorage,
        request: async (url) => {
          let data;
          if (url === "/api/session")
            data = {
              configured: true,
              connected: success,
              cloudSync: true,
              csrf: "fixture",
              account,
              preferences: {},
              onboardingComplete: false,
            };
          else if (url === "/api/profile") data = { id: 7, name: "MALViewer" };
          else if (url.startsWith("/api/list"))
            data = { data: [], nextOffset: null };
          else if (url === "/api/account/state")
            data = {
              revision: 0,
              reactions: {},
              settings: {},
              preferences: {},
              onboardingComplete: false,
            };
          else throw Error("Unexpected request: " + url);
          return Response.json(data);
        },
      });
      const root = createRoot(document.getElementById("root"));
      try {
        await act(async () => {
          root.render(React.createElement(App, { store }));
          await store.initialize();
        });
        const modal = document.querySelector("dialog[open]");
        assert.ok(modal);
        if (success) {
          assert.equal(store.getSnapshot().session.account.id, "mal:7");
          assert.equal(modal.querySelector('a[href="/auth/start"]'), null);
          assert.match(modal.textContent, /Start shuffling/);
          assert.ok(
            modal.querySelector(
              '[aria-label="Auto-add watchlist to MyAnimeList"]',
            ),
          );
          assert.equal(
            modal.querySelector(
              '[aria-label="Auto-add watchlist to MyAnimeList"]',
            ).checked,
            false,
          );
        } else {
          assert.match(
            modal.querySelector('[role="alert"]').textContent,
            /MAL_TOKEN/,
          );
          assert.ok(modal.querySelector('a[href="/auth/start"]'));
        }
      } finally {
        await act(async () => root.unmount());
        dom.window.close();
      }
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
