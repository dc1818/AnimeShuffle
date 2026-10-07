import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("reopening retains the paused player; delayed readiness, errors and stale metadata are handled", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const outfile = path.join(folder, "Trailer.mjs");
  await build({
    entryPoints: ["src/components/TrailerPreview.jsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { TrailerPreview } = await import(pathToFileURL(outfile));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://shuffle.example",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const original = globalThis.fetch;
  let calls = 0,
    release;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 2) await new Promise((r) => (release = r));
    return Response.json({
      videoId: "abcdefghijk",
      trailers: [{ videoId: "abcdefghijk", title: "PV" }],
    });
  };
  const instances = [];
  window.YT = {
    Player: class {
      constructor(frame, { events }) {
        this.frame = frame;
        this.events = events;
        this.plays = 0;
        this.pauses = 0;
        instances.push(this);
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
        this.frame.remove();
      }
    },
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const render = (id) =>
    root.render(
      React.createElement(TrailerPreview, {
        key: id,
        anime: { id, title: "Anime " + id },
      }),
    );
  try {
    await act(async () => render(1));
    assert.equal(calls, 0);
    await act(async () => document.querySelector(".watch-preview").focus());
    assert.equal(calls, 1);
    assert.equal(document.querySelector("iframe"), null);
    await act(async () => document.querySelector(".watch-preview").click());
    const frame = document.querySelector("iframe"),
      instance = instances[0];
    assert.equal(frame.referrerPolicy, "strict-origin-when-cross-origin");
    assert.match(frame.src, /enablejsapi=1/);
    // Close before YouTube becomes ready: it must never play behind the cover.
    await act(async () =>
      document.querySelector(".trailer-toolbar button").click(),
    );
    await act(async () => instance.events.onReady({ target: instance }));
    assert.equal(instance.plays, 0);
    assert.ok(instance.pauses > 0);
    assert.equal(document.querySelector(".trailer-panel").hidden, true);
    await act(async () => document.querySelector(".watch-preview").click());
    assert.equal(document.querySelector("iframe"), frame);
    assert.equal(instances.length, 1);
    assert.equal(calls, 1);
    assert.equal(instance.plays, 1);
    await act(async () => instance.events.onAutoplayBlocked());
    assert.match(document.body.textContent, /Press Play/);
    await act(async () =>
      instance.events.onStateChange({ target: instance, data: 1 }),
    );
    assert.doesNotMatch(
      document.body.textContent,
      /Loading YouTube|Starting preview/,
    );
    await act(async () =>
      document.querySelector(".trailer-toolbar button").click(),
    );
    assert.ok(instance.pauses >= 2);
    await act(async () =>
      instance.events.onStateChange({ target: instance, data: 1 }),
    );
    assert.ok(
      instance.pauses >= 3,
      "Late playing events are paused behind cover",
    );
    await act(async () => document.querySelector(".watch-preview").click());
    await act(async () => instance.events.onError({ data: 150 }));
    assert.match(document.body.textContent, /publisher doesn’t allow/);
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Retry player")
        .click(),
    );
    assert.equal(instance.destroyed, true);
    assert.equal(instances.length, 2);
    await act(async () => render(2));
    assert.equal(instances[1].destroyed, true);
    await act(async () => document.querySelector(".watch-preview").focus());
    await act(async () => document.querySelector(".watch-preview").click());
    assert.equal(calls, 2, "Focus and click share a lookup");
    await act(async () => render(3));
    await act(async () => release());
    assert.equal(
      document.querySelector("iframe"),
      null,
      "Stale response cannot open a new card’s player",
    );
    await act(async () => render(1));
    await act(async () => document.querySelector(".watch-preview").click());
    assert.equal(calls, 2, "Metadata survives tab/card remounts");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = original;
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
