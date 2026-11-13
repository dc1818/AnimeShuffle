import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { normalizePreferences } from "../src/lib/preferences.js";

test("Watchlist owns one expanded preview, pauses previous players, and ignores late results without stealing focus", async () => {
  const folder = await mkdtemp(path.resolve(".watchlist-preview-"));
  await build({
    entryPoints: ["src/components/Watchlist.jsx"],
    outfile: path.join(folder, "ui.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { Watchlist } = await import(
    pathToFileURL(path.join(folder, "ui.mjs"))
  );
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://fixture.test",
    pretendToBeVisual: true,
  });
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  let resolveMetadata;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      resolveMetadata = resolve;
    });
  const players = [];
  window.YT = {
    Player: class {
      constructor(frame, { events }) {
        this.frame = frame;
        this.events = events;
        this.plays = 0;
        this.pauses = 0;
        players.push(this);
      }
      mute() {}
      playVideo() {
        this.plays++;
      }
      pauseVideo() {
        this.pauses++;
      }
      destroy() {
        this.destroyed = true;
      }
    },
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const list = [1, 2, 3].map((id) => ({
    id,
    title: `Saved ${id}`,
    genres: ["Action"],
    format: "tv",
    listStatus: { status: "plan_to_watch" },
    ...(id < 3
      ? {
          previewVideoId: id === 1 ? "abcdefghijk" : "12345678901",
          previewRegionChecked: true,
        }
      : {}),
  }));
  let state = {
    list,
    reactions: {},
    preferences: normalizePreferences(),
    session: {},
    settings: {},
  };
  const store = {};
  const render = () =>
    act(async () =>
      root.render(React.createElement(Watchlist, { state, store })),
    );
  const trigger = (id) =>
    document.querySelector(`[aria-label="Preview Saved ${id}"]`);
  const card = (id) => trigger(id).closest(".saved-card");
  const open = (id) => act(async () => trigger(id).click());
  const check = (id) => {
    assert.equal(
      document.querySelectorAll(".trailer-panel:not([hidden])").length,
      1,
    );
    assert.equal(card(id).querySelector(".trailer-panel").hidden, false);
    assert.equal(
      document.activeElement,
      card(id).querySelector(".trailer-toolbar button"),
    );
    for (const other of list.filter((a) => a.id !== id))
      if (trigger(other.id)) {
        assert.equal(trigger(other.id).hidden, false);
        assert.ok(
          !card(other.id).querySelector(".trailer-panel:not([hidden])"),
        );
      }
  };
  try {
    await render();
    await open(1);
    check(1);
    const first = players[0],
      firstFrame = first.frame;
    await open(2);
    check(2);
    const second = players[1];
    await act(async () => first.events.onReady({ target: first }));
    assert.equal(
      first.plays,
      0,
      "late readiness must not start a closed preview",
    );
    assert.ok(first.pauses > 0);
    await act(async () => second.events.onReady({ target: second }));
    assert.equal(second.plays, 1);
    await open(1);
    check(1);
    assert.ok(
      second.pauses > 0,
      "switching immediately pauses the previous player",
    );
    assert.equal(
      card(1).querySelector("iframe"),
      firstFrame,
      "returning reuses the paused player",
    );
    await act(async () =>
      second.events.onStateChange({ target: second, data: 1 }),
    );
    assert.ok(second.pauses > 1, "late playing events are stopped too");
    await open(3);
    check(3);
    assert.ok(resolveMetadata);
    await open(1);
    check(1);
    await act(async () =>
      resolveMetadata(Response.json({ videoId: null, trailers: [] })),
    );
    check(1);
    await act(async () =>
      card(1).querySelector(".trailer-toolbar button").click(),
    );
    assert.equal(
      document.querySelectorAll(".trailer-panel:not([hidden])").length,
      0,
    );
    assert.equal(document.activeElement, trigger(1));
    await open(2);
    check(2);
    state = { ...state, list: list.filter((a) => a.id !== 2) };
    await render();
    assert.ok(second.destroyed);
    await open(1);
    check(1);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, original);
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
