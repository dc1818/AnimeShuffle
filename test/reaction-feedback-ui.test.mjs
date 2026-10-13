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
    entryPoints: ["src/components/AnimeCard.jsx"],
    outfile: path.join(folder, "ui.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { AnimeDetails } = await import(
    pathToFileURL(path.join(folder, "ui.mjs"))
  );
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.dataset.hosting = "pages";
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
  const reaction = {
    anime: { id: 1, title: "Cowboy Bebop" },
    action: "good",
    at: 1,
  };
  const props = {
    anime: { id: 205, title: "Samurai Champloo" },
    responsive: true,
    reactions: {},
    onClose() {},
    onSaveFeedback: async (...args) => saves.push(args),
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
      root.render(React.createElement(AnimeDetails, props)),
    );
    await click("Why this pick?");
    assert.equal(
      document.querySelector(".why-feedback-entry"),
      null,
      "first visit has no feedback entry",
    );
    await act(async () =>
      root.render(
        React.createElement(AnimeDetails, {
          ...props,
          reactions: { 1: reaction },
        }),
      ),
    );
    assert.match(
      document.querySelector(".why-feedback-entry").textContent,
      /Cowboy Bebop/,
    );
    await click("Add a reason for this reaction");
    assert.equal(
      document.querySelectorAll("dialog").length,
      1,
      "reuse existing mobile panel",
    );
    assert.equal(
      document.querySelector('[role="tablist"]'),
      null,
      "editor replaces anime details",
    );
    assert.equal(document.querySelector("h2").textContent, "Cowboy Bebop");
    assert.equal(
      document.querySelector('.feedback-editor [aria-pressed="true"]'),
      null,
      "No reason or opinion is preselected",
    );
    assert.equal(document.querySelector("textarea"), null);
    assert.ok(!document.body.textContent.includes("personal note"));
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
    assert.equal(document.querySelector(".feedback-editor"), null);
    assert.equal(
      document.querySelector('[role="tab"][aria-selected="true"]').textContent,
      "Why this pick?",
    );
    assert.equal(
      document.activeElement.textContent,
      "Add a reason for this reaction",
    );
    await act(async () =>
      root.render(
        React.createElement(AnimeDetails, {
          ...props,
          reactions: {
            1: {
              ...reaction,
              action: "watch",
              feedback: { aspects: [{ key: "artwork", sentiment: "liked" }] },
            },
          },
        }),
      ),
    );
    await click("Add a reason for this reaction");
    assert.ok(document.body.textContent.includes("What caught your eye?"));
    assert.equal(
      document.querySelector('.feedback-editor [aria-pressed="true"]'),
      null,
      "Previously saved Artwork is not selected in the add flow",
    );
    assert.match(
      document.querySelector(".feedback-saved").textContent,
      /Artwork.*Appealed to me/,
    );
    assert.equal(
      saves.length,
      2,
      "Reopening existing feedback does not invent or overwrite votes",
    );
    assert.ok(!document.body.textContent.includes("Animation"));
    assert.ok(document.body.textContent.includes("Artwork"));
    assert.ok(!document.body.textContent.includes("Villain"));
    await act(async () =>
      root.render(React.createElement(AnimeDetails, props)),
    );
    assert.equal(
      document.querySelector(".feedback-editor"),
      null,
      "removed reaction cannot still be edited",
    );
    assert.equal(document.querySelector(".why-feedback-entry"), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
