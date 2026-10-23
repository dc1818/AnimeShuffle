import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_TREE, createCategoryTree } from "../src/lib/category-tree.js";
import { TAXONOMY_EDGES, TAXONOMY_NODES } from "../src/lib/anime-taxonomy.js";

test("all active categories are reachable and every original active browse edge remains available", () => {
  for (const node of CATEGORY_TREE.selectable)
    assert.ok(CATEGORY_TREE.paths.has(node.id), node.id);
  for (const edge of TAXONOMY_EDGES) {
    if (
      !CATEGORY_TREE.byId.has(edge.parent) ||
      !CATEGORY_TREE.byId.has(edge.child)
    )
      continue;
    assert.ok(
      CATEGORY_TREE.children(edge.parent).some((e) => e.child === edge.child),
      `${edge.parent} → ${edge.child}`,
    );
  }
  assert.deepEqual(CATEGORY_TREE.paths.get("magical-sex-shift"), [
    "anime-taxonomy",
    "__other-categories",
    "magical-sex-shift",
  ]);
  // Indexing is UI-only; the source taxonomy has not acquired an invented parent edge.
  assert.equal(
    TAXONOMY_NODES.some((n) => n.id === "__other-categories"),
    false,
  );
});

test("all browse paths terminate and cycle links are excluded when expanding ancestors", () => {
  let leaves = 0,
    maxDepth = 0;
  const walk = (id, path = []) => {
    const children = CATEGORY_TREE.children(id, path);
    maxDepth = Math.max(maxDepth, path.length);
    if (!children.length) leaves++;
    for (const e of children) {
      assert.ok(!path.includes(e.child));
      walk(e.child, [...path, id]);
    }
  };
  walk(CATEGORY_TREE.root);
  assert.ok(leaves >= 439);
  assert.ok(maxDepth >= 6);
  const tree = createCategoryTree(
    [
      { id: "root", status: "active" },
      { id: "a", status: "active", kind: "category" },
    ],
    [
      { parent: "root", child: "a", type: "group" },
      { parent: "a", child: "root", type: "related" },
    ],
    "root",
  );
  assert.deepEqual(tree.children("a", ["root"]), []);
});
