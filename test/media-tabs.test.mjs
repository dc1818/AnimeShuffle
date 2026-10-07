import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("details lazily load galleries, preserve paused trailers across tabs and reset on new anime", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-")),
    outfile = path.join(folder, "Media.mjs");
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
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://shuffle.example",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const original = globalThis.fetch,
    calls = [],
    players = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.includes("pictures"))
      return Response.json({
        pictures: [
          { image: "https://cdn.myanimelist.net/images/anime/1/2.jpg" },
          { image: "https://cdn.myanimelist.net/images/anime/1/3.jpg" },
          { image: "https://cdn.myanimelist.net/images/anime/1/4.jpg" },
        ],
      });
    return Response.json({
      videoId: "abcdefghijk",
      trailers: [
        { videoId: "abcdefghijk", title: "PV 1" },
        { videoId: "12345678901", title: "PV 2" },
      ],
    });
  };
  window.YT = {
    Player: class {
      constructor(frame, { events }) {
        this.frame = frame;
        this.events = events;
        this.pauses = 0;
        players.push(this);
      }
      mute() {}
      playVideo() {}
      pauseVideo() {
        this.pauses++;
      }
      destroy() {
        this.destroyed = true;
        this.frame.remove();
      }
    },
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const render = (id) =>
    root.render(
      React.createElement(AnimeDetails, {
        anime: { id, title: "Test", genres: [], studios: [] },
        onClose() {},
      }),
    );
  const tab = (name) =>
    [...document.querySelectorAll('[role="tab"]')].find(
      (b) => b.textContent === name,
    );
  try {
    await act(async () => render(1));
    assert.equal(calls.length, 0);
    await act(async () => tab("Trailers").click());
    assert.deepEqual(calls, ["/api/trailer/1"]);
    assert.equal(document.querySelector("iframe"), null);
    await act(async () =>
      document.querySelector(".media-trailers button").click(),
    );
    const frame = document.querySelector("iframe"),
      player = players[0];
    await act(async () => player.events.onReady({ target: player }));
    await act(async () => tab("Images").click());
    assert.deepEqual(calls, ["/api/trailer/1", "/api/pictures/1"]);
    assert.equal(player.pauses, 1);
    assert.equal(document.querySelector("iframe"), frame);
    assert.match(
      document.querySelector(".image-carousel-controls").textContent,
      /1 \/ 3/,
    );
    const next = document.querySelector('[aria-label="Next image"]');
    const previous = document.querySelector('[aria-label="Previous image"]');
    await act(async () => previous.click());
    assert.match(
      document.querySelector(".image-carousel-controls").textContent,
      /3 \/ 3/,
    );
    await act(async () => next.click());
    assert.match(
      document.querySelector(".image-carousel-controls").textContent,
      /1 \/ 3/,
    );
    await act(async () =>
      document.querySelector('[aria-label="Show image 2 of 3"]').click(),
    );
    assert.match(
      document.querySelector(".image-carousel-stage img").alt,
      /image 2 of 3/,
    );
    assert.equal(
      document
        .querySelector('[aria-label="Show image 2 of 3"]')
        .getAttribute("aria-current"),
      "true",
    );
    const stage = document.querySelector(".image-carousel-stage");
    function pointer(type, x, y) {
      const e = new window.Event(type, { bubbles: true });
      Object.assign(e, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "touch",
      });
      stage.dispatchEvent(e);
    }
    await act(async () => {
      pointer("pointerdown", 150, 50);
      pointer("pointerup", 50, 55);
    });
    assert.match(
      document.querySelector(".image-carousel-controls").textContent,
      /3 \/ 3/,
    );
    await act(async () => {
      pointer("pointerdown", 150, 50);
      pointer("pointerup", 140, 150);
    });
    assert.match(
      document.querySelector(".image-carousel-controls").textContent,
      /3 \/ 3/,
      "Vertical scrolling must not change images",
    );
    await act(async () => tab("Trailers").click());
    assert.equal(document.querySelector("iframe"), frame);
    assert.equal(calls.length, 2);
    await act(async () =>
      document.querySelectorAll(".media-trailers button")[1].click(),
    );
    assert.equal(player.destroyed, true);
    assert.match(document.querySelector("iframe").src, /12345678901/);
    await act(async () => players[1].events.onError({ data: 150 }));
    assert.equal(
      document.querySelectorAll(".media-trailers button").length,
      1,
      "Rejected trailer is removed from the list",
    );
    assert.equal(document.querySelector("iframe"), null);

    await act(async () => render(2));
    assert.equal(players[1].destroyed, true);
    assert.equal(tab("Synopsis").getAttribute("aria-selected"), "true");
    assert.equal(document.querySelector("iframe"), null);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = original;
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
