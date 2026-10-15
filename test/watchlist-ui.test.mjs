import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { normalizePreferences } from "../src/lib/preferences.js";

test("Watchlist stays interactive during ranking; filters and revisits reuse scores; recommendation decisions retain rows and Undo", async () => {
  const folder = await mkdtemp(path.resolve(".watchlist-ui-"));
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.dataset.hosting = "pages";
  window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const observers = [];
  globalThis.IntersectionObserver = class {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      observers.push(this);
    }
    observe(target) {
      this.target = target;
    }
    disconnect() {}
  };
  const workers = [];
  globalThis.Worker = class {
    constructor() {
      workers.push(this);
    }
    postMessage(data) {
      this.data = data;
    }
    terminate() {
      this.terminated = true;
    }
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const list = Array.from({ length: 218 }, (_, i) => ({
    id: i + 1,
    title: `Anime ${i + 1}`,
    image: `https://cdn.myanimelist.net/images/anime/${i + 1}.jpg`,
    genres: ["Action"],
    format: "tv",
    status: "finished_airing",
    duration: 24,
    episodes: 12,
    listStatus: { status: "plan_to_watch" },
  }));
  let state = {
    list,
    reactions: {},
    preferences: normalizePreferences(),
    session: {},
    settings: {},
    ready: true,
    onboardingComplete: true,
    recommendationsReady: true,
    recommendationPicks: [],
    undoableIds: [],
  };
  let finishDetails;
  const store = {
    getAnimeDetails: (anime) =>
      new Promise((resolve) => {
        assert.equal(anime.id, 1);
        finishDetails = resolve;
      }),
  };
  try {
    await build({
      stdin: {
        contents:
          'export { Watchlist } from "./src/components/Watchlist.jsx"; export { Recommendations } from "./src/components/Recommendations.jsx";',
        resolveDir: process.cwd(),
        loader: "jsx",
      },
      outfile: path.join(folder, "ui.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      packages: "external",
    });
    const { Watchlist, Recommendations } = await import(
      pathToFileURL(path.join(folder, "ui.mjs"))
    );
    const renderList = () =>
      act(async () =>
        root.render(React.createElement(Watchlist, { state, store })),
      );
    await renderList();
    assert.equal(
      document.querySelectorAll(".saved-card").length,
      60,
      "First page renders before worker returns",
    );
    assert.match(
      document.querySelector(".watchlist-count").textContent,
      /218 of 218/,
    );
    assert.equal(workers.length, 1);
    const covers = document.querySelectorAll(".saved-image img");
    assert.ok(
      covers[0].getAttribute("src")?.startsWith("https://cdn.myanimelist.net/"),
    );
    assert.equal(covers[8].getAttribute("src"), null);
    assert.equal(observers[0].options.rootMargin, "2400px 0px");
    await act(async () => observers[0].callback([{ isIntersecting: true }]));
    assert.ok(
      covers[8].getAttribute("src"),
      "Loads upcoming images before they enter the viewport",
    );
    await act(async () => document.querySelector(".details-toggle").click());
    const modal = document.querySelector("dialog.details-modal");
    assert.ok(modal?.open);
    assert.match(modal.querySelector("h2").textContent, /Anime 1/);
    await act(async () =>
      finishDetails({
        ...list[0],
        synopsis: "Full synopsis for this saved title.",
      }),
    );
    assert.match(modal.textContent, /Full synopsis for this saved title/);
    modal.getBoundingClientRect = () => ({
      left: 100,
      right: 500,
      top: 100,
      bottom: 600,
    });
    await act(async () => modal.querySelector("h2").click());
    assert.ok(document.querySelector("dialog.details-modal"));
    await act(async () =>
      modal.dispatchEvent(
        new window.MouseEvent("click", {
          bubbles: true,
          clientX: 20,
          clientY: 20,
        }),
      ),
    );
    assert.equal(document.querySelector("dialog.details-modal"), null);

    const search = document.querySelector('input[type="search"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set.call(search, "Anime 218");
      search.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.equal(document.querySelectorAll(".saved-card").length, 1);
    assert.match(
      document.querySelector(".saved-card").textContent,
      /Anime 218/,
    );
    const genre = [...document.querySelectorAll("label")]
      .find((el) => el.textContent.startsWith("Genre"))
      .querySelector("select");
    await act(async () => {
      genre.value = "Romance";
      genre.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.equal(document.querySelectorAll(".saved-card").length, 0);
    assert.equal(workers.length, 1, "Typing and filters do not retrain");
    await act(async () =>
      workers[0].onmessage({
        data: Object.fromEntries(list.map((a) => [a.id, a.id])),
      }),
    );
    await act(async () => root.render(null));
    await renderList();
    assert.equal(workers.length, 1, "Tab revisit uses cached ranking");
    assert.match(
      document.querySelector(".saved-card").textContent,
      /Anime 218/,
    );
    const more = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.startsWith("Show more"),
    );
    await act(async () => more.click());
    assert.equal(document.querySelectorAll(".saved-card").length, 120);

    const picks = list
      .slice(0, 2)
      .map((anime, i) => ({ anime, tier: i + 1, reason: "Test match" }));
    state = {
      ...state,
      list: [],
      recommendationPicks: picks,
      current: picks[0].anime,
    };
    store.react = (action, anime) => {
      state = {
        ...state,
        reactions: { [anime.id]: { anime, action } },
        undoableIds: [anime.id],
      };
    };
    store.undo = (id) => {
      assert.equal(id, 1);
      state = { ...state, reactions: {}, undoableIds: [] };
    };
    const renderPicks = () =>
      act(async () =>
        root.render(React.createElement(Recommendations, { state, store })),
      );
    await renderPicks();
    for (const action of ["good", "bad", "watch", "nope"]) {
      await act(async () => store.react(action, picks[0].anime));
      if (action === "watch") state = { ...state, list: [list[0]] };
      await renderPicks();
      assert.equal(document.querySelectorAll(".leaderboard-row").length, 2);
      assert.ok(
        document
          .querySelector(".leaderboard-row")
          .classList.contains("reacted"),
      );
      assert.equal(
        document.querySelector(".leaderboard-number").textContent,
        "1",
      );
      const undo = [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Undo this choice"),
      );
      assert.ok(undo && !undo.disabled);
      await act(async () => undo.click());
      state = { ...state, list: [] };
      await renderPicks();
      assert.ok(
        !document
          .querySelector(".leaderboard-row")
          .classList.contains("reacted"),
      );
    }
  } finally {
    await act(async () => root.unmount());
    delete globalThis.Worker;
    delete globalThis.IntersectionObserver;
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
