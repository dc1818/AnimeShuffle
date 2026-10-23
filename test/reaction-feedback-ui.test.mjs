import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("feedback supports multiple categories, one-click likes, custom reasons and remove-only saved rows", async () => {
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
  const { AnimeDetails, AnimeCard } = await import(
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
      (b) => b.getAttribute("aria-label") === text || b.textContent === text,
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
    await click("Visuals");
    assert.equal(saves.length, 0, "Opening categories does not add votes");
    assert.ok(document.querySelector("#feedback-group-characters"));
    assert.ok(document.querySelector("#feedback-group-visuals"));
    await click("Villain / antagonist");
    assert.deepEqual(saves.at(-1)[1].aspects, [
      { key: "villain", sentiment: "liked" },
    ]);
    assert.match(
      document.querySelector(".reason-flash .reason-label").textContent,
      /Liked/,
    );
    await click("Animation");
    assert.deepEqual(saves.at(-1)[1].aspects, [
      { key: "villain", sentiment: "liked" },
      { key: "animation", sentiment: "liked" },
    ]);
    await click("Animation");
    assert.deepEqual(saves.at(-1)[1].aspects, [
      { key: "villain", sentiment: "liked" },
    ]);
    const animationButton = document.querySelector(
      'button[aria-label="Animation"]',
    );
    assert.equal(animationButton.getAttribute("aria-pressed"), "false");
    assert.match(animationButton.textContent, /Unliked/);
    assert.ok(
      !document
        .querySelector(".feedback-saved")
        .textContent.includes("Animation"),
    );
    await click("Animation");
    assert.equal(animationButton.getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector(".feedback-dislike"), null);
    assert.equal(
      document.querySelector('.feedback-saved [aria-label^="Edit"]'),
      null,
    );
    const input = document.querySelector(".feedback-custom input");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set.call(input, "The quiet moments between battles");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await act(async () =>
      document
        .querySelector(".feedback-custom")
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    assert.deepEqual(saves.at(-1)[1].customReasons, [
      "The quiet moments between battles",
    ]);
    assert.match(
      document.querySelector(".feedback-saved").textContent,
      /The quiet moments between battles/,
    );
    await act(async () =>
      document.querySelector('[aria-label="Remove Animation"]').click(),
    );
    assert.deepEqual(saves.at(-1)[1].aspects, [
      { key: "villain", sentiment: "liked" },
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
    assert.match(document.querySelector(".feedback-saved-indicator").textContent, /1 reason saved/);
    await click("Update reasons for this reaction");
    assert.ok(document.body.textContent.includes("What caught your eye?"));
    assert.equal(
      document.querySelector('.feedback-editor [aria-pressed="true"]'),
      null,
      "Previously saved Artwork is not selected in the add flow",
    );
    assert.match(
      document.querySelector(".feedback-saved").textContent,
      /Artwork.*Liked/,
    );
    assert.equal(
      saves.length,
      6,
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
    // An outside press must not reflow the card before the button gets its click.
    const events = [];
    await act(async () =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(AnimeCard, {
            anime: reaction.anime,
            detailsOpen: true,
            canUndo: true,
            onReact: (action) => events.push(action),
            onSkip: () => events.push("skip"),
            onUndo: () => events.push("undo"),
          }),
          React.createElement(AnimeDetails, {
            ...props,
            responsive: false,
            onClose: () => events.push("close"),
          }),
        ),
      ),
    );
    for (const [selector, expected] of [
      [".reaction.good", "good"],
      [".reaction.bad", "bad"],
      [".reaction.watch", "watch"],
      [".reaction.nope", "nope"],
      [".secondary-actions button:last-child", "skip"],
      [".secondary-actions button:first-child", "undo"],
    ]) {
      events.length = 0;
      const button = document.querySelector(selector);
      await act(async () =>
        button.dispatchEvent(
          new window.MouseEvent("pointerdown", { bubbles: true }),
        ),
      );
      assert.deepEqual(
        events,
        [],
        "Pressing down must leave the button in place",
      );
      await act(async () => button.click());
      assert.deepEqual(
        events,
        [expected, "close"],
        "The card action fires before outside dismissal",
      );
    }
    events.length = 0;
    await act(async () =>
      document.querySelector('#details-card [role="tab"]').click(),
    );
    assert.deepEqual(events, [], "Clicks inside Details keep it open");
    await act(async () =>
      root.render(
        React.createElement(AnimeDetails, {
          ...props,
          responsive: false,
          reactions: { 1: reaction },
          onClose: () => events.push("close"),
        }),
      ),
    );
    await click("Why this pick?");
    await click("Add a reason for this reaction");
    assert.deepEqual(
      events,
      [],
      "Replacing a clicked feedback button must not dismiss Details",
    );
    delete document.documentElement.dataset.hosting;
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      Response.json({ pictures: [{ image: "https://example.com/art.jpg" }] });
    try {
      await act(async () =>
        root.render(
          React.createElement(AnimeDetails, {
            ...props,
            key: "gallery",
            responsive: false,
            onClose: () => events.push("close"),
          }),
        ),
      );
      await click("Images");
      await click("View image 1 of 1");
      assert.ok(document.querySelector(".image-carousel-stage"));
      assert.deepEqual(
        events,
        [],
        "Replacing a gallery thumbnail must not dismiss Details",
      );
    } finally {
      globalThis.fetch = oldFetch;
    }
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
