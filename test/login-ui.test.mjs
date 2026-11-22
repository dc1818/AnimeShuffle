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

test("signed-in Settings opens from the name, and Help opens on the first click", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://shuffle.example/#watchlist",
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
  const root = createRoot(document.getElementById("root"));
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
    const initial = createAnimeStore({ storage: localStorage }).getSnapshot();
    const snapshot = {
      ...initial,
      ready: true,
      onboardingComplete: true,
      session: {
        ...initial.session,
        account: { id: "local:test", name: "Test Viewer", provider: "local" },
      },
    };
    const store = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
      initialize: () => {},
    };
    await act(async () => root.render(React.createElement(App, { store })));
    const accountButton = document.querySelector(
      'button[aria-label="Open settings for Test Viewer"]',
    );
    assert.equal(accountButton.textContent, "Test Viewer");
    await act(async () => accountButton.click());
    const settings = () =>
      document.querySelector("dialog[open] #settings-title");
    assert.equal(settings()?.textContent, "Settings");
    assert.equal(location.hash, "#watchlist");
    const selectSection = async (name) => {
      const button = [
        ...document.querySelectorAll("dialog[open] .panel-navigation button"),
      ].find((item) => item.textContent === name);
      assert.ok(button);
      await act(async () => button.click());
    };
    const assertHelpOpen = () => {
      assert.equal(settings()?.textContent, "Settings");
      assert.equal(
        document.querySelector(
          "dialog[open] .panel-navigation [aria-current=page]",
        )?.textContent,
        "Help",
      );
      assert.match(
        document.querySelector("dialog[open] .panel-content").textContent,
        /Keyboard shortcuts/,
      );
    };
    await selectSection("Help");
    assertHelpOpen();
    await selectSection("Viewing preferences");
    assert.ok(document.getElementById("preferences-title"));
    await selectSection("Help");
    assertHelpOpen();
    await act(async () =>
      document.querySelector("dialog button.primary").click(),
    );
    assert.equal(settings(), null);
    assert.equal(
      document.querySelector('.topbar [aria-label="Open settings"]'),
      null,
    );

    await act(async () => {
      location.hash = "#profile";
      window.dispatchEvent(new window.HashChangeEvent("hashchange"));
    });
    assert.equal(location.hash, "#discover");
    assert.equal(settings()?.textContent, "Settings");
    assert.equal(document.querySelector(".profile-page"), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
