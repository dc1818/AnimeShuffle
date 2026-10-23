import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { swipeChoice } from "../src/lib/discover-swipe.js";

test("swipe mapping has intentional direction, distance and diagonal guards", () => {
  assert.equal(swipeChoice(-100, 3), "good");
  assert.equal(swipeChoice(100, 3), "bad");
  assert.equal(swipeChoice(2, -100), "watch");
  assert.equal(swipeChoice(2, 100), "nope");
  assert.equal(swipeChoice(30, 20), null);
  assert.equal(swipeChoice(100, 100), null);
});

test("Discover touch gestures share reactions and ignore scrolling controls, cancellation and unavailable actions", async () => {
  const folder = await mkdtemp(path.resolve(".swipe-test-"));
  await build({
    entryPoints: ["src/components/AnimeCard.jsx"],
    outfile: path.join(folder, "card.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { AnimeCard } = await import(
    pathToFileURL(path.join(folder, "card.mjs"))
  );
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.dataset.hosting = "pages";
  let phone = true;
  window.matchMedia = (q) => ({
    matches: q.includes("max-width") ? phone : true,
  });
  const root = createRoot(document.getElementById("root"));
  const reactions = [];
  let props = {
    anime: {
      id: 1,
      title: "Cowboy Bebop",
      genres: [],
      status: "finished_airing",
    },
    onReact: (a) => reactions.push(a),
    onDetails: () => {},
    onWhy: () => {},
    onSkip: () => {},
    onUndo: () => {},
  };
  const render = async (extra) => {
    props = { ...props, ...extra };
    await act(async () => root.render(React.createElement(AnimeCard, props)));
  };
  function pointer(target, type, x, y, extra = {}) {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      ...extra,
    });
    target.dispatchEvent(event);
  }
  const swipe = async (x, y, extra = {}, end = "pointerup", target = null) => {
    const area = target || document.querySelector(".poster-stage");
    await act(async () => {
      pointer(area, "pointerdown", 150, 200, extra);
      pointer(area, "pointermove", 150 + x, 200 + y, extra);
      pointer(area, end, 150 + x, 200 + y, extra);
      await new Promise((r) => setTimeout(r, 10));
    });
  };
  try {
    await render({});
    for (const [x, y, expected] of [
      [-100, 0, "good"],
      [100, 0, "bad"],
      [0, -100, "watch"],
      [0, 100, "nope"],
    ]) {
      const n = reactions.length;
      await swipe(x, y);
      assert.equal(reactions.length, n + 1);
      assert.equal(reactions.at(-1), expected);
    }
    const count = reactions.length;
    await swipe(20, 0);
    await swipe(100, 100);
    await swipe(0, -100, {}, "pointercancel");
    await swipe(-100, 0, { pointerType: "mouse" });
    assert.equal(reactions.length, count);
    phone = false;
    await swipe(-100, 0);
    phone = true;
    assert.equal(reactions.length, count);
    await render({ busy: true });
    await swipe(-100, 0);
    assert.equal(reactions.length, count);
    await render({ busy: false });
    await render({ reactionDisabled: true });
    await swipe(-100, 0);
    assert.equal(reactions.length, count);
    await render({ reactionDisabled: false });
    await render({ compact: true });
    await swipe(-100, 0);
    assert.equal(reactions.length, count);
    await render({ compact: false });
    const dialog = document.createElement("dialog");
    dialog.open = true;
    document.body.append(dialog);
    await swipe(-100, 0);
    dialog.remove();
    assert.equal(reactions.length, count);
    const preview = document.createElement("button");
    document.querySelector(".poster-stage").append(preview);
    await swipe(-100, 0, {}, "pointerup", preview);
    preview.remove();
    assert.equal(reactions.length, count);
    await render({ anime: { ...props.anime, status: "not_yet_aired" } });
    await swipe(-100, 0);
    await swipe(100, 0);
    assert.equal(reactions.length, count);
    await swipe(0, -100);
    assert.equal(reactions.at(-1), "watch");
    await render({ anime: { ...props.anime, status: "finished_airing" } });
    const area = document.querySelector(".poster-stage");
    await act(async () => {
      pointer(area, "pointerdown", 150, 200);
      pointer(area, "pointermove", 50, 200);
      pointer(area, "pointerdown", 160, 200, {
        pointerId: 2,
        isPrimary: false,
      });
      pointer(area, "pointerup", 50, 200);
      await new Promise((r) => setTimeout(r, 10));
    });
    assert.equal(reactions.length, count + 1, "second finger cancels");
    await act(async () => {
      pointer(area, "pointerdown", 150, 200);
      pointer(area, "pointermove", 50, 200);
      window.dispatchEvent(new window.Event("resize"));
      pointer(area, "pointerup", 50, 200);
      await new Promise((r) => setTimeout(r, 10));
    });
    assert.equal(reactions.length, count + 1, "resize cancels");
    await act(async () =>
      document.querySelector("button.reaction.good").click(),
    );
    assert.equal(reactions.at(-1), "good", "tap alternative still works");
    assert.equal(document.querySelectorAll("article.anime-card").length, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
