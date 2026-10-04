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
      assert.equal(button("Start shuffling").disabled, true);
      await click("Surprise me — any anime");
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
      // Saved picks no longer reappear in recommendations.
      // Discovery and recommendations intentionally yield to the browser. Wait
      // for the completed state instead of assuming a single React flush is enough.
      for (
        let attempt = 0;
        attempt < 100 && !store.getSnapshot().recommendationsReady;
        attempt++
      )
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
      assert.equal(document.querySelectorAll(".leaderboard-row").length, 6);
      assert.equal(
        document
          .querySelector(".leaderboard-number")
          .getAttribute("aria-label"),
        "Gold, Tier 1",
      );
      assert.equal(document.querySelectorAll(".medal-1").length, 1);
      const toggles = [...document.querySelectorAll(".leaderboard-toggle")];
      assert.equal(toggles[0].getAttribute("aria-expanded"), "true");
      await act(async () => toggles[1].click());
      assert.equal(toggles[0].getAttribute("aria-expanded"), "false");
      assert.equal(toggles[1].getAttribute("aria-expanded"), "true");
      assert.equal(document.querySelectorAll(".ranked-card").length, 1);
      await act(async () => toggles[1].click());
      assert.equal(document.querySelectorAll(".ranked-card").length, 0);
      await act(async () => toggles[0].click());

      assert.equal(
        document.querySelectorAll(".ranked-card .reaction").length,
        4,
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
      assert.equal(document.querySelectorAll(".leaderboard-row").length, 6);
      assert.equal(
        document.querySelectorAll(".leaderboard-row.reacted").length,
        1,
      );
      await click("Undo this choice");
      assert.equal(
        document.querySelectorAll(".leaderboard-row.reacted").length,
        0,
      );
      assert.equal(document.querySelectorAll(".leaderboard-row").length, 6);

      await act(async () =>
        document.querySelector(".ranked-card .reaction.watch").click(),
      );
      assert.equal(
        document.getElementById(`recommendation-heading-${firstId}`),
        null,
        "Saved title immediately leaves the loaded recommendations",
      );
      assert.equal(store.getSnapshot().reactions[firstId].action, "watch");
      await act(async () =>
        [...document.querySelectorAll("nav button")][1].click(),
      );
      assert.equal(document.querySelectorAll(".saved-card").length, 2);
      await click("Recommendations");
      assert.equal(
        document.querySelectorAll(".leaderboard-row.reacted").length,
        0,
      );
      await click("Refresh picks");
      for (let n = 0; n < 100 && store.getSnapshot().busy; n++)
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
        });
      assert.equal(
        document.querySelectorAll(".leaderboard-row.reacted").length,
        0,
      );
      assert.equal(document.querySelectorAll(".leaderboard-row").length, 5);
      assert.equal(
        document.getElementById(`recommendation-heading-${firstId}`),
        null,
      );
      await click("Undo last reaction");
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
        await click("More about this anime");
        await act(async () =>
          document.querySelector(".reaction." + action).click(),
        );
        assert.equal(document.getElementById("details-card"), null);
        assert.equal(store.getSnapshot().reactions[1].action, action);
        await click("Undo");
      }
      await click("More about this anime");
      await click("Skip");
      assert.equal(document.getElementById("details-card"), null);
      assert.notEqual(
        document.getElementById("anime-title").textContent,
        "Cowboy Bebop",
      );
      await click("More about this anime");
      await click("Undo");
      assert.equal(document.getElementById("details-card"), null);
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
      await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
      assert.equal(
        document.querySelector(".preference-save-status").textContent,
        "Saved",
      );
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

test("returning focus preserves a Discover card even when MAL adds it during background sync", async () => {
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
    pretendToBeVisual: true,
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
  let clock = 100000,
    entries = [],
    reads = 0;
  const anime = {
    id: 1,
    title: "Loaded card",
    genres: ["Action"],
    nsfw: "white",
    format: "tv",
    ageRating: "pg_13",
    status: "finished_airing",
    prequels: [],
  };
  localStorage.setItem(
    "anime-shuffle:7",
    JSON.stringify({ onboardingComplete: true }),
  );
  const store = createAnimeStore({
    storage: localStorage,
    now: () => clock,
    request: async (url) => {
      const ok = (value) => Response.json(value);
      if (url === "/api/session")
        return ok({ configured: true, connected: true });
      if (url === "/api/profile") return ok({ id: 7 });
      if (url.startsWith("/api/list")) {
        reads++;
        return ok({ data: entries, nextOffset: null });
      }
      if (url.startsWith("/api/catalog"))
        return ok({
          data: [anime, { ...anime, id: 2, title: "Next card" }],
          nextOffset: null,
        });
      if (url.startsWith("/api/anime/"))
        return ok({ ...anime, id: Number(url.split("/").pop()) });
      if (url.startsWith("/api/taste")) return ok({ profiles: {} });
      throw Error(url);
    },
  });
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => {
      root.render(React.createElement(App, { store }));
      await store.initialize();
    });
    const displayed = store.getSnapshot().current;
    const card = document.getElementById("anime-title");
    assert.ok(card);
    entries = [
      { ...displayed, listStatus: { status: "plan_to_watch", score: 0 } },
    ];
    clock += 300001;
    await act(async () => {
      window.dispatchEvent(new dom.window.Event("focus"));
      document.dispatchEvent(new dom.window.Event("visibilitychange"));
      await store.refreshMalIfStale();
    });
    assert.equal(reads, 2);
    assert.equal(store.getSnapshot().current, displayed);
    assert.equal(document.getElementById("anime-title"), card);
    assert.equal(store.getSnapshot().discoveryLoading, false);
    assert.ok(
      [...document.querySelectorAll(".reaction")].every((b) => b.disabled),
    );
    const skip = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Skip",
    );
    assert.equal(skip.disabled, false);
    assert.match(document.body.textContent, /now on your MyAnimeList/);
    await act(async () => {
      await store.skip();
    });
    assert.notEqual(store.getSnapshot().current?.id, displayed.id);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
