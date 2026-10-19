import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("category browsing drills down, saves optional interests, and preserves independent filters", async () => {
  const folder = await mkdtemp(path.resolve(".taxonomy-ui-"));
  try {
    await build({
      entryPoints: ["src/components/TaxonomyPreferences.jsx"],
      outfile: path.join(folder, "ui.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      packages: "external",
    });
    const { TaxonomyPreferences } = await import(
      pathToFileURL(path.join(folder, "ui.mjs"))
    );
    const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root"));
    let value = {
      preferredNodes: [],
      restrictNodes: false,
      requiredThemes: ["School"],
    };
    const render = () =>
      root.render(
        React.createElement(TaxonomyPreferences, {
          value,
          setValue: (fn) => {
            value = fn(value);
            render();
          },
        }),
      );
    await act(async () => render());
    const click = async (text) => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent === text || b.getAttribute("aria-label") === text,
      );
      assert.ok(b, text);
      await act(async () => b.click());
    };
    await click("Subject / ThemeBrowse family");
    await click("Explore Mecha: 7 categories");
    assert.ok(
      document
        .querySelector(".taxonomy-breadcrumbs")
        .textContent.includes("Mecha"),
    );
    const select = [...document.querySelectorAll(".taxonomy-choice")].find(
      (b) => b.textContent.startsWith("Real Robot"),
    );
    await act(async () => select.click());
    assert.deepEqual(value.preferredNodes, ["real-robot"]);
    assert.equal(value.restrictNodes, false);
    assert.deepEqual(value.requiredThemes, ["School"]);
    await act(async () =>
      document.querySelector("input[type=checkbox]").click(),
    );
    assert.equal(value.restrictNodes, true);
    assert.match(document.body.textContent, /unknown tags are excluded/);
    await click("Remove Real Robot");
    assert.deepEqual(value.preferredNodes, []);
    await click("All categories");
    assert.equal(
      document.querySelector(".taxonomy-breadcrumbs").textContent,
      "All categories",
    );
    assert.equal(document.querySelector("button[aria-pressed=true]"), null);
    await act(async () => root.unmount());
    dom.window.close();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("Discover's shared card badges always show audience without guessing unknown demographics", async () => {
  const folder = await mkdtemp(path.resolve(".taxonomy-ui-"));
  try {
    await build({
      entryPoints: ["src/components/GenreBadges.jsx"],
      outfile: path.join(folder, "badges.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      packages: "external",
    });
    const { GenreBadges } = await import(
      pathToFileURL(path.join(folder, "badges.mjs"))
    );
    const { renderToStaticMarkup } = await import("react-dom/server");
    for (const [anime, expected] of [
      [{ id: 1, genres: ["Action", "Shounen"] }, "Shounen"],
      [
        { id: 2, genres: ["Action"], demographics: [{ name: "Seinen" }] },
        "Seinen",
      ],
      [{ id: 3, genres: ["Action"], ageRating: "r" }, "Not listed"],
    ]) {
      const dom = new JSDOM(
        renderToStaticMarkup(React.createElement(GenreBadges, { anime })),
      );
      const row = dom.window.document.querySelector(".genre-group-audience");
      assert.ok(row);
      assert.match(row.textContent, new RegExp(`Audience${expected}`));
      dom.window.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
