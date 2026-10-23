import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { CATEGORY_TREE, createCategoryTree } from "../src/lib/category-tree.js";

test("category browsing expands in place, saves optional interests, and preserves independent filters", async () => {
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
    await click("Expand Subject / Theme");
    await click("Expand Mecha");
    // Selecting the name/checkbox selects the branch; browsing remains independent.
    const mechaCheck = document.querySelector('[aria-label="Select Mecha"]');
    await act(async () => mechaCheck.closest("label").click());
    assert.ok(value.preferredNodes.includes("mecha"));
    assert.ok(value.preferredNodes.includes("real-robot"));
    assert.ok(
      document.querySelector('[aria-label="Select Real Robot"]').checked,
    );
    await act(async () =>
      document.querySelector('[aria-label="Select Real Robot"]').click(),
    );
    assert.equal(mechaCheck.indeterminate, true);
    assert.ok(!value.preferredNodes.includes("mecha"));
    await click("Remove Super Robot");
    // Clean any additional descendants so the remaining workflow starts empty.
    while (value.preferredNodes.length) {
      const remove = document.querySelector(".interest-chips button");
      await act(async () => remove.click());
    }
    // Reading help never saves an interest; add/remove is an explicit action.
    const about = document.querySelector('[aria-label="About Real Robot"]');
    await click("About Real Robot");
    assert.deepEqual(value.preferredNodes, []);
    assert.equal(about.getAttribute("aria-expanded"), "true");
    assert.match(
      document.querySelector(".interest-reader").textContent,
      /operational constraints/,
    );
    assert.equal(document.querySelector(".interest-reader-select"), null);
    assert.match(
      document.querySelector(".interest-reader").textContent,
      /Parent categories/,
    );
    assert.match(
      document.querySelector(".interest-reader").textContent,
      /Related categories/,
    );
    assert.deepEqual(value.preferredNodes, [], "Information is read-only");
    await click("Close category details");
    assert.equal(document.activeElement, about);
    assert.equal(document.querySelector(".interest-reader"), null);
    const select = document.querySelector('[aria-label="Select Real Robot"]');
    assert.ok(select);
    await act(async () => select.click());
    assert.deepEqual(value.preferredNodes, ["real-robot"]);
    assert.equal(value.restrictNodes, false);
    assert.deepEqual(value.requiredThemes, ["School"]);
    await act(async () =>
      document.querySelector(".interest-restrict input").click(),
    );
    assert.equal(value.restrictNodes, true);
    assert.match(document.body.textContent, /unknown tags are excluded/);
    await click("Collapse Mecha");
    assert.equal(
      document.querySelector('[aria-label="Select Real Robot"]'),
      null,
    );
    await click("Expand Mecha");
    assert.equal(
      document.querySelector('[aria-label="Select Real Robot"]').checked,
      true,
    );
    await click("Remove Real Robot");
    assert.deepEqual(value.preferredNodes, []);
    assert.equal(
      document.querySelector('[aria-label="Select Real Robot"]').checked,
      false,
    );
    // Close help safely even if collapsing its branch removed the original opener.
    await click("About Real Robot");
    await click("Collapse Mecha");
    await click("Close category details");
    assert.equal(document.activeElement.getAttribute("type"), "search");
    // Related links reveal their target, restore tree focus, and never select it.
    await click("Expand Mecha");
    await click("About Real Robot");
    const related = document.querySelector(".interest-context-links button");
    const relatedLabel = related.textContent;
    await act(async () => related.click());
    assert.equal(document.querySelector(".category-popover"), null);
    assert.ok(document.activeElement.closest("[data-node-id]"));
    assert.match(
      document.activeElement.closest(".interest-row").textContent,
      new RegExp(relatedLabel),
    );
    assert.deepEqual(value.preferredNodes, []);
    // Structural families expand without changing taste preferences.
    await click("Collapse Subject / Theme");
    assert.deepEqual(value.preferredNodes, []);
    // The audience leaf preserves the existing Kids content behavior.
    await act(async () =>
      document.querySelector('[aria-label="Select Kodomo"]').click(),
    );
    assert.equal(value.childrenTitles, "include");
    // Walk every current root-to-leaf route through the actual rendered controls.
    const leafPaths = [];
    function enumerate(id, path = []) {
      const edges = CATEGORY_TREE.children(id, path);
      if (!edges.length) leafPaths.push([...path, id]);
      for (const e of edges) enumerate(e.child, [...path, id]);
    }
    enumerate(CATEGORY_TREE.root);
    for (const path of leafPaths) {
      for (let i = 1; i < path.length; i++) {
        const current = path.slice(0, i + 1).join("/");
        const row = [...document.querySelectorAll("[data-path]")].find(
          (e) => e.dataset.path === current,
        );
        // Empty structural roots are deliberately omitted, rather than fake expansion buttons.
        if (
          !row &&
          CATEGORY_TREE.byId.get(path[i]).kind === "structural" &&
          !CATEGORY_TREE.children(path[i]).length
        )
          continue;
        assert.ok(row, current);
        if (i < path.length - 1) {
          const button = row.querySelector(
            ":scope > .interest-row > .interest-branch-toggle, :scope > .interest-browse-children",
          );
          assert.ok(button, current);
          if (button.getAttribute("aria-expanded") !== "true")
            await act(async () => button.click());
        }
      }
    }
    assert.ok(leafPaths.length >= 200);
    assert.deepEqual(
      value.preferredNodes,
      ["kodomo"],
      "Browsing every tree never changes selected interests",
    );

    // Every future level uses the same expansion behavior, never a navigation replacement.
    const nodes = Array.from({ length: 31 }, (_, i) => ({
      id: i ? `level-${i}` : "anime-taxonomy",
      label: `Level ${i}`,
      aliases: [],
      kind: i ? "category" : "structural",
      status: "active",
    }));
    const edges = nodes
      .slice(1)
      .map((n, i) => ({ parent: nodes[i].id, child: n.id, type: "subtype" }));
    const deepTree = createCategoryTree(nodes, edges);
    await act(async () =>
      root.render(
        React.createElement(TaxonomyPreferences, {
          key: "deep",
          value: { preferredNodes: [] },
          setValue: () => assert.fail("browse should not select"),
          expanded: true,
          tree: deepTree,
        }),
      ),
    );
    for (let i = 1; i < 30; i++) {
      const row = [...document.querySelectorAll("[data-node-id]")].find(
        (e) => e.dataset.nodeId === `level-${i}`,
      );
      assert.ok(row, `future level ${i}`);
      const button = row.querySelector(
        ":scope > .interest-row > .interest-branch-toggle, :scope > .interest-browse-children",
      );
      await act(async () => button.click());
      assert.equal(button.getAttribute("aria-expanded"), "true");
      assert.ok(
        document.querySelector(`[aria-label="Collapse Level 1"]`),
        "Ancestors stay visible",
      );
    }
    assert.ok(document.querySelector('[aria-label="Select Level 30"]'));
    assert.equal(document.querySelector(".interest-full-path"), null);
    assert.doesNotMatch(
      document.body.textContent,
      /Browse deeper|All categories/,
    );
    assert.equal(
      document.querySelector(
        `[data-node-id="level-30"] .interest-branch-toggle`,
      ),
      null,
      "Leaves have no expansion control",
    );
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
