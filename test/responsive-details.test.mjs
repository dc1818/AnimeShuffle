import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

test("responsive details switch between modal and inline panel, release scroll lock, and preserve both titles", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const outfile = path.join(folder, "Card.mjs");
  await build({
    entryPoints: ["src/components/AnimeCard.jsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { AnimeDetails } = await import(pathToFileURL(outfile));
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let narrow = true,
    listener,
    closes = 0;
  window.matchMedia = () => ({
    get matches() {
      return narrow;
    },
    addEventListener: (_event, fn) => {
      listener = fn;
    },
    removeEventListener: () => {},
  });
  window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const root = createRoot(document.getElementById("root"));
  const anime = {
    id: 16498,
    title: "Shingeki no Kyojin",
    englishTitle: "Attack on Titan",
    genres: [],
    studios: [],
    synopsis: "A long synopsis that must remain available in full.",
    score: 8.5,
  };
  try {
    await act(async () =>
      root.render(
        React.createElement(AnimeDetails, {
          anime,
          responsive: true,
          onClose: () => {
            closes++;
          },
        }),
      ),
    );
    assert.ok(document.querySelector("dialog[open]"));
    assert.equal(document.body.style.overflow, "hidden");
    assert.equal(
      document.querySelector(".english-title").textContent,
      "Attack on Titan",
    );
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    let panels = [...document.querySelectorAll('[role="tabpanel"]')];
    assert.equal(tabs.length, 5);
    assert.equal(panels[0].hidden, false);
    assert.equal(panels[1].hidden, true);
    assert.equal(
      document.querySelector(".full-synopsis").textContent,
      anime.synopsis,
    );
    await act(async () => tabs[1].click());
    panels = [...document.querySelectorAll('[role="tabpanel"]')];
    assert.equal(panels[0].hidden, true);
    assert.equal(panels[1].hidden, false);
    assert.match(panels[1].textContent, /8.50 \/ 10/);
    await act(async () =>
      tabs[1].dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
        }),
      ),
    );
    assert.equal(document.activeElement, tabs[2]);
    assert.equal(tabs[2].getAttribute("aria-selected"), "true");
    assert.equal(
      document.querySelectorAll('[role="tabpanel"]')[2].hidden,
      false,
    );
    await act(async () =>
      root.render(
        React.createElement(AnimeDetails, {
          anime: { ...anime, id: 2 },
          responsive: true,
          onClose: () => {
            closes++;
          },
        }),
      ),
    );
    assert.equal(
      document.querySelector('[role="tab"]').getAttribute("aria-selected"),
      "true",
      "New titles open at Synopsis",
    );
    await act(async () =>
      document
        .querySelector("dialog")
        .dispatchEvent(new window.Event("cancel", { cancelable: true })),
    );
    assert.equal(closes, 1);
    await act(async () => {
      narrow = false;
      listener();
    });
    assert.ok(document.querySelector("aside.details-card"));
    assert.equal(document.querySelector("dialog"), null);
    assert.equal(document.body.style.overflow, "");
    await act(async () => {
      narrow = true;
      listener();
    });
    assert.ok(document.querySelector("dialog[open]"));
    await act(async () => root.unmount());
    assert.equal(document.body.style.overflow, "");
  } finally {
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
