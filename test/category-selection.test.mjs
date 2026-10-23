import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_TREE, createCategoryTree } from "../src/lib/category-tree.js";
import {
  categorySelectionIndex,
  branchSelection,
  toggleCategoryBranch,
} from "../src/lib/category-selection.js";
import { normalizePreferences } from "../src/lib/preferences.js";

test("group selection includes every descendant, removes as a group, and survives normalization above 64", () => {
  const groups = categorySelectionIndex(CATEGORY_TREE);
  const all = toggleCategoryBranch(groups, CATEGORY_TREE.root, []);
  assert.equal(all.length, CATEGORY_TREE.selectable.length);
  assert.deepEqual(
    normalizePreferences({ preferredNodes: all }).preferredNodes,
    all,
  );
  for (const id of CATEGORY_TREE.byId.keys()) {
    const ids = toggleCategoryBranch(groups, id, []);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(groups.get(id).every((child) => ids.includes(child)));
    assert.deepEqual(toggleCategoryBranch(groups, id, ids), []);
  }
  const mecha = toggleCategoryBranch(groups, "mecha", []);
  assert.ok(mecha.includes("real-robot"));
  assert.ok(!mecha.includes("science-fiction"), "related is not a descendant");
  const partial = toggleCategoryBranch(groups, "real-robot", mecha);
  assert.ok(!partial.includes("real-robot"));
  assert.ok(
    !partial.includes("mecha"),
    "no broad parent overriding a removed child",
  );
  assert.ok(partial.includes("super-robot"));
  assert.equal(branchSelection(groups, "mecha", partial).mixed, true);
  assert.deepEqual(
    new Set(toggleCategoryBranch(groups, "mecha", partial)),
    new Set(mecha),
  );
});

test("deep branches are complete and related back-links are excluded", () => {
  const nodes = Array.from({ length: 100 }, (_, i) => ({
    id: `n${i}`,
    kind: i ? "category" : "structural",
    status: "active",
  }));
  const edges = nodes
    .slice(1)
    .map((n, i) => ({ parent: `n${i}`, child: n.id, type: "subtype" }));
  edges.push({ parent: "n90", child: "n30", type: "related" });
  const groups = categorySelectionIndex(createCategoryTree(nodes, edges, "n0"));
  assert.equal(toggleCategoryBranch(groups, "n0", []).length, 99);
  assert.equal(toggleCategoryBranch(groups, "n60", []).length, 40);
});
