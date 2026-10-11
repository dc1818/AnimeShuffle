import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("optional UI asks only applicable viewing questions and requires an explicit aspect opinion", async () => {
  const folder = await mkdtemp(path.resolve(".feedback-ui-"));
  await build({
    entryPoints: ["src/components/ReactionFeedback.jsx"],
    outfile: path.join(folder, "ui.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { ReactionFeedback } = await import(
    pathToFileURL(path.join(folder, "ui.mjs"))
  );
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
  window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const saves = [];
  const props = {
    reaction: { anime: { id: 1, title: "Cowboy Bebop" }, action: "good" },
    onSave: async (...args) => saves.push(args),
  };
  const click = async (text) => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
    assert.ok(button, text);
    await act(async () => button.click());
  };
  try {
    await act(async () =>
      root.render(React.createElement(ReactionFeedback, props)),
    );
    assert.equal(document.querySelector("dialog"), null);
    await click("Add a reason (optional)");
    assert.ok(document.querySelector("dialog[open]"));
    assert.ok(!document.body.textContent.includes("Romance"));
    await click("Characters");
    await click("Villain / antagonist");
    assert.equal(
      saves.length,
      0,
      "category/detail selection alone is not a vote",
    );
    await click("Liked");
    assert.deepEqual(saves.at(-1), [
      1,
      {
        version: 1,
        aspects: [{ key: "villain", sentiment: "liked" }],
        note: "",
      },
    ]);
    await click("Visuals");
    await click("Animation");
    const dislike = [...document.querySelectorAll("fieldset")]
      .find((f) => f.textContent.includes("Animation"))
      .querySelector(".feedback-dislike");
    await act(async () => dislike.click());
    assert.deepEqual(saves.at(-1)[1].aspects, [
      { key: "villain", sentiment: "liked" },
      { key: "animation", sentiment: "disliked" },
    ]);
    await click("Done");
    assert.equal(document.querySelector("dialog"), null);
    await act(async () =>
      root.render(
        React.createElement(ReactionFeedback, {
          ...props,
          key: "watch",
          reaction: { ...props.reaction, action: "watch" },
          startOpen: true,
        }),
      ),
    );
    assert.ok(document.body.textContent.includes("What caught your eye?"));
    assert.ok(!document.body.textContent.includes("Animation"));
    assert.ok(document.body.textContent.includes("Artwork"));
    assert.ok(!document.body.textContent.includes("Villain"));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
