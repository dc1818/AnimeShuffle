import test from "node:test";
import assert from "node:assert/strict";
import { TAXONOMY_NODES } from "../src/lib/anime-taxonomy.js";
import { categoryDefinition } from "../src/lib/category-help.js";

test("every active category and structural group has useful local reading help", () => {
  for (const node of TAXONOMY_NODES.filter((n) => n.status === "active")) {
    const definition = categoryDefinition(node);
    assert.ok(definition.length >= 30, node.id);
    assert.doesNotMatch(definition, /not available.*yet/, node.id);
    if (node.definition)
      assert.equal(
        definition,
        node.definition,
        "Keep researched meanings intact",
      );
  }
});
