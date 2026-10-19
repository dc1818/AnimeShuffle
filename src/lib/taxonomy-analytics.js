import {
  SELECTABLE_NODES,
  TAXONOMY_VERSION,
  taxonomyMemberships,
} from "./anime-taxonomy.js";

/** Reuses the exact matching graph. No inferred absence, external calls or per-title queries. */
export function taxonomyAnalytics(titles = [], reactions = []) {
  const nodes = SELECTABLE_NODES.map((n) => ({
    id: n.id,
    label: n.label,
    facet: n.facet,
    direct: 0,
    inherited: 0,
    good: 0,
    bad: 0,
    watch: 0,
    nope: 0,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let contentCovered = 0,
    inheritedTitles = 0;
  for (const anime of titles) {
    let content = false,
      inherited = false;
    for (const m of taxonomyMemberships(anime).values()) {
      const row = byId.get(m.id);
      row[m.direct ? "direct" : "inherited"]++;
      if (m.source !== "Release format") content = true;
      if (!m.direct) inherited = true;
    }
    if (content) contentCovered++;
    if (inherited) inheritedTitles++;
  }
  for (const r of reactions) {
    if (!["good", "bad", "watch", "nope"].includes(r.action)) continue;
    for (const m of taxonomyMemberships(r.anime).values())
      byId.get(m.id)[r.action]++;
  }
  return {
    version: TAXONOMY_VERSION,
    titleCount: titles.length,
    contentCovered,
    inheritedTitles,
    reactionCount: reactions.length,
    nodes,
  };
}

/** Pages have disjoint MAL IDs; direct/inherited are exclusive per node/title. */
export function mergeTaxonomyAnalytics(previous, page) {
  if (!previous) return page;
  if (previous.version !== page.version)
    throw Error("Category graph changed. Restart the catalog scan.");
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  return {
    ...page,
    titleCount: previous.titleCount + page.titleCount,
    contentCovered: previous.contentCovered + page.contentCovered,
    inheritedTitles: previous.inheritedTitles + page.inheritedTitles,
    reactionCount: previous.reactionCount + page.reactionCount,
    nodes: previous.nodes.map((n) => {
      const next = { ...n },
        other = byId.get(n.id);
      for (const k of ["direct", "inherited", "good", "bad", "watch", "nope"])
        next[k] += other?.[k] || 0;
      return next;
    }),
  };
}
