/** Hierarchy selection follows real child edges, never related-category links. */
export function categorySelectionIndex(tree) {
  const groups = new Map();
  for (const id of tree.byId.keys()) {
    const seen = new Set(),
      ids = [],
      queue = [id];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (seen.has(current)) continue;
      seen.add(current);
      if (tree.byId.get(current)?.kind === "category") ids.push(current);
      queue.push(...tree.children(current).map((edge) => edge.child));
    }
    groups.set(id, ids);
  }
  return groups;
}

export function branchSelection(groups, id, selected) {
  const ids = groups.get(id) || [];
  const count = ids.filter((key) => selected.includes(key)).length;
  return {
    ids,
    count,
    checked: ids.length > 0 && count === ids.length,
    mixed: count > 0 && count < ids.length,
  };
}

export function toggleCategoryBranch(groups, id, selected, remove = false) {
  const state = branchSelection(groups, id, selected);
  if (!remove && !state.checked)
    return [...new Set([...selected, ...state.ids])];
  const removed = new Set(state.ids);
  // An explicitly selected broad ancestor would still match the child just removed.
  // Retain the other descendants, but clear that ancestor's broad preference.
  return selected.filter(
    (key) =>
      !removed.has(key) &&
      !(groups.get(key) || []).some((child) => removed.has(child)),
  );
}
