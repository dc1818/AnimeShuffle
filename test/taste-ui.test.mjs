import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

import { defaultPreferences } from "../src/lib/preferences.js";

test("favorite autocomplete shows covers, selects three, supports removal and genre choices", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const outfile = path.join(folder, "Taste.mjs");
  await build({
    entryPoints: ["src/components/TasteSetup.jsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { TasteSetup } = await import(pathToFileURL(outfile));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost:5173",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const fixture = [1, 2, 3].map((id) => ({
    id,
    title: `Anime ${id}`,
    genres: ["Action"],
    status: "finished_airing",
    image: `https://cdn.myanimelist.net/images/anime/1/${id}.jpg`,
  }));
  const store = { searchAnime: async () => fixture };
  let current;
  function Wrapper() {
    const [value, setValue] = React.useState(defaultPreferences);
    current = value;
    return React.createElement(TasteSetup, { value, setValue, store });
  }
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(Wrapper)));
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Action")
        .click(),
    );
    assert.deepEqual(current.favoriteGenres, ["Action"]);
    const input = document.getElementById("favorite-search");
    for (let i = 0; i < 3; i++) {
      // React tracks direct value assignment, so use the native setter to emulate typing.
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          "value",
        ).set.call(input, `Search ${i}`);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
      await act(async () => await new Promise((r) => setTimeout(r, 400)));
      assert.ok(document.querySelector(".favorite-results img"));
      await act(async () =>
        document.querySelector(".favorite-results button").click(),
      );
    }
    assert.equal(current.favoriteAnime.length, 3);
    assert.equal(input.disabled, true);
    await act(async () =>
      document.querySelector(".favorite-selections button").click(),
    );
    assert.equal(current.favoriteAnime.length, 2);
    assert.equal(input.disabled, false);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test("returning accounts edit viewing filters without repeating onboarding or changing auto-add", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const outfile = path.join(folder, "Onboarding.mjs");
  await build({
    entryPoints: ["src/components/Onboarding.jsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { ViewingPreferences } = await import(pathToFileURL(outfile));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost:5173",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const preferences = {
    ...defaultPreferences(),
    favoriteGenres: ["Action"],
    favoriteAnime: [{ id: 1, title: "Favorite" }],
  };
  let saved;
  const store = {
    savePreferences: async (...args) => {
      saved = args;
    },
    searchAnime: async () => [],
  };
  const state = {
    preferences,
    settings: { autoAdd: true },
    session: { connected: true, account: { id: "mal:7" } },
    onboardingComplete: true,
  };
  try {
    await act(async () =>
      root.render(
        React.createElement(ViewingPreferences, {
          state,
          store,
          onComplete() {},
        }),
      ),
    );
    assert.doesNotMatch(
      document.body.textContent,
      /Pick three anime|What genres|Auto-add watchlist/,
    );
    for (const text of [
      "What would you like to watch?",
      "How long a series?",
      "Finished shows only",
      "Include unknown lengths or formats",
    ])
      assert.ok(document.body.textContent.includes(text));
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Save preferences")
        .click(),
    );
    assert.deepEqual(
      saved,
      [preferences, {}],
      "Hidden taste and auto-add choices are preserved",
    );
    await act(async () =>
      root.render(
        React.createElement(ViewingPreferences, {
          state: { ...state, onboardingComplete: false },
          store,
          onComplete() {},
        }),
      ),
    );
    assert.match(document.body.textContent, /Pick three anime/);
    assert.match(document.body.textContent, /What genres/);
    assert.match(document.body.textContent, /Auto-add watchlist/);
    // Mount an untouched first-use screen to verify the two start choices.
    await act(async () =>
      root.render(
        React.createElement(ViewingPreferences, {
          key: "fresh",
          state: {
            ...state,
            preferences: defaultPreferences(),
            settings: { autoAdd: false },
            onboardingComplete: false,
          },
          store,
          onComplete() {},
        }),
      ),
    );
    const button = (text) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === text,
      );
    assert.equal(button("Start shuffling").disabled, true);
    assert.ok(button("Surprise me — any anime"));
    await act(async () => button("Anything").click());
    assert.equal(button("Start shuffling").disabled, false);
    assert.equal(button("Surprise me — any anime"), undefined);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test("watchlist labels MAL update time and requires a cancellable removal confirmation", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const outfile = path.join(folder, "Watchlist.mjs");
  await build({
    entryPoints: ["src/components/Watchlist.jsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { Watchlist } = await import(pathToFileURL(outfile));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost:5173",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const anime = {
    id: 1,
    title: "Planned show",
    genres: ["Action"],
    format: "tv",
    episodes: 12,
    status: "finished_airing",
    listStatus: { status: "plan_to_watch", updated_at: "2026-10-01T12:00:00Z" },
  };
  const calls = [];
  const store = {
    removeSaved: async (...args) => {
      calls.push(args);
      return { removed: true };
    },
  };
  const state = {
    preferences: defaultPreferences(),
    reactions: { 1: { anime, action: "watch", at: 1700000000000 } },
    list: [anime],
    settings: { autoAdd: false },
    session: { connected: true },
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
  try {
    await act(async () =>
      root.render(React.createElement(Watchlist, { state, store })),
    );
    assert.match(document.body.textContent, /Found on Anime Shuffle/);
    assert.match(document.body.textContent, /MAL last updated/);
    await act(async () => button("Remove").click());
    assert.equal(calls.length, 0);
    assert.ok(document.querySelector("dialog[open]"));
    await act(async () => button("Cancel").click());
    assert.equal(calls.length, 0);
    await act(async () => button("Remove").click());
    await act(async () => button("Remove from both").click());
    assert.deepEqual(calls, [[1, true]]);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
