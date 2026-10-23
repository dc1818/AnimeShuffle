import { TAXONOMY_NODES, TAXONOMY_EDGES } from "./anime-taxonomy.js";

// UI-only graph index. Related links remain browse links, never subtype inference.
export function createCategoryTree(nodes, edges, root = "anime-taxonomy") {
  const byId = new Map(
    nodes.filter((n) => n.status === "active").map((n) => [n.id, n]),
  );
  const children = new Map();
  for (const edge of edges) {
    if (!byId.has(edge.parent) || !byId.has(edge.child)) continue;
    if (!children.has(edge.parent)) children.set(edge.parent, new Map());
    const previous = children.get(edge.parent).get(edge.child);
    if (!previous || previous.type === "related")
      children.get(edge.parent).set(edge.child, edge);
  }
  const childEdges = (id) => [...(children.get(id)?.values() || [])];
  const paths = new Map([[root, [root]]]);
  const queue = [root];
  for (let i = 0; i < queue.length; i++) {
    for (const e of childEdges(queue[i]))
      if (!paths.has(e.child)) {
        paths.set(e.child, [...paths.get(queue[i]), e.child]);
        queue.push(e.child);
      }
  }
  const unlinked = [...byId.values()].filter(
    (n) => n.kind === "category" && !paths.has(n.id),
  );
  if (unlinked.length) {
    const id = "__other-categories";
    byId.set(id, {
      id,
      label: "Other categories",
      kind: "structural",
      status: "active",
      aliases: [],
      definition:
        "Categories that are not yet connected to a browse branch. They can still be selected and searched.",
    });
    if (!children.has(root)) children.set(root, new Map());
    children.get(root).set(id, { parent: root, child: id, type: "group" });
    children.set(
      id,
      new Map(
        unlinked.map((n) => [n.id, { parent: id, child: n.id, type: "group" }]),
      ),
    );
    paths.set(id, [root, id]);
    for (const node of unlinked) paths.set(node.id, [root, id, node.id]);
  }
  return {
    root,
    byId,
    paths,
    selectable: [...byId.values()].filter((n) => n.kind === "category"),
    children: (id, ancestors = []) =>
      childEdges(id).filter(
        (e) => e.child !== id && !ancestors.includes(e.child),
      ),
  };
}
export const CATEGORY_TREE = createCategoryTree(TAXONOMY_NODES, TAXONOMY_EDGES);
// Show three nested levels at a time. Deeper branches open with their full path.
export const INLINE_TREE_LEVELS = 3;
