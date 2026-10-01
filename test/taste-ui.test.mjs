import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

import { defaultPreferences } from "../src/lib/preferences.js";

test("favorite autocomplete shows covers, selects three, supports removal and genre choices", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const outfile = path.join(folder, "Taste.mjs");
  await build({
    entryPoints: ["src/components/TasteSetup.jsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { TasteSetup } = await import(pathToFileURL(outfile));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost:5173",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const fixture = [1, 2, 3].map((id) => ({
    id,
    title: `Anime ${id}`,
    genres: ["Action"],
    status: "finished_airing",
    image: `https://cdn.myanimelist.net/images/anime/1/${id}.jpg`,
  }));
  const store = { searchAnime: async () => fixture };
  let current;
  function Wrapper() {
    const [value, setValue] = React.useState(defaultPreferences);
    current = value;
    return React.createElement(TasteSetup, { value, setValue, store });
  }
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(Wrapper)));
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Action")
        .click(),
    );
    assert.deepEqual(current.favoriteGenres, ["Action"]);
    const input = document.getElementById("favorite-search");
    for (let i = 0; i < 3; i++) {
      // React tracks direct value assignment, so use the native setter to emulate typing.
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          "value",
        ).set.call(input, `Search ${i}`);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
      await act(async () => await new Promise((r) => setTimeout(r, 400)));
      assert.ok(document.querySelector(".favorite-results img"));
      await act(async () =>
        document.querySelector(".favorite-results button").click(),
      );
    }
    assert.equal(current.favoriteAnime.length, 3);
    assert.equal(input.disabled, true);
    await act(async () =>
      document.querySelector(".favorite-selections button").click(),
    );
    assert.equal(current.favoriteAnime.length, 2);
    assert.equal(input.disabled, false);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
