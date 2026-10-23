import data from "./anime-taxonomy-data.json" with { type: "json" };
/** Static, source-bounded graph: no network requests, AI calls or database reads.
 * Research browse links never imply title membership. Only reviewed subtype edges
 * propagate upwards, and each ancestor contributes at most once per anime.
 */
export const TAXONOMY_VERSION = data.version;
export const TAXONOMY_NODES = data.nodes;
export const TAXONOMY_EDGES = data.edges;
export const TAXONOMY_BY_ID = new Map(data.nodes.map((n) => [n.id, n]));
export const SELECTABLE_NODES = data.nodes.filter(
  (n) => n.kind === "category" && n.status === "active",
);
const active = new Set(SELECTABLE_NODES.map((n) => n.id));
const key = (s) =>
  typeof s === "string"
    ? s
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
// Aliases in the report sometimes describe overlap, not identity. They are useful
// for search; only explicit exact mappings below are used to assign memberships.
const names = new Map(
  SELECTABLE_NODES.flatMap((n) => [
    [key(n.id), n.id],
    [key(n.label), n.id],
  ]),
);
for (const [label, id] of Object.entries({
  "Sci-Fi": "science-fiction",
  Experimental: "avant-garde",
  Kids: "kodomo",
  Shonen: "shounen",
  Shojo: "shoujo",
  Shōnen: "shounen",
  Shōjo: "shoujo",
  Detective: "detectives",
  Vampire: "vampires",
  "Super Power": "superpowers",
  "Magical Girl": "mahou-shoujo",
  Harem: "harem-reverse-harem",
  "Boys Love": "boys-love",
  "Girls Love": "girls-love",
}))
  names.set(key(label), id);
export const nodeForLabel = (label) => names.get(key(label)) || null;
export const cleanNodeIds = (input) =>
  Array.isArray(input)
    ? [...new Set(input.filter((id) => active.has(id)))]
    : [];
const parents = new Map(data.nodes.map((n) => [n.id, []]));
const children = new Map(data.nodes.map((n) => [n.id, []]));
for (const e of data.edges) {
  parents.get(e.child).push(e);
  children.get(e.parent).push(e);
}
export const nodeParents = (id) => parents.get(id) || [];
export const nodeChildren = (id) =>
  (children.get(id) || []).filter(
    (e) => TAXONOMY_BY_ID.get(e.child).status === "active",
  );
const ancestors = new Map();
function ancestorDepths(id) {
  if (ancestors.has(id)) return ancestors.get(id);
  const result = new Map(),
    queue = [[id, 0]];
  for (let i = 0; i < queue.length; i++) {
    const [child, depth] = queue[i];
    for (const e of nodeParents(child))
      if (
        e.type === "subtype" &&
        active.has(e.parent) &&
        (!result.has(e.parent) || depth + 1 < result.get(e.parent))
      ) {
        result.set(e.parent, depth + 1);
        queue.push([e.parent, depth + 1]);
      }
  }
  ancestors.set(id, result);
  return result;
}
for (const id of active) ancestorDepths(id);
const formats = {
  tv: "tv",
  movie: "movies",
  ova: "ova",
  ona: "ona",
  special: "special",
  tv_special: "tv-special",
  music: "music-video",
  pv: "promotional",
  cm: "commercial",
};
const origins = {
  manga: "based-on-manga",
  "4 koma manga": "based-on-4-koma-manga",
  novel: "based-on-novel",
  "light novel": "based-on-light-novel",
  "web novel": "based-on-web-novel",
  "visual novel": "based-on-visual-novel",
  game: "based-on-video-game",
  "web manga": "based-on-manga",
  original: "original-work",
};
const cache = new WeakMap();
export function taxonomyMemberships(anime) {
  if (!anime || typeof anime !== "object") return new Map();
  if (cache.has(anime)) return cache.get(anime);
  const direct = new Map();
  const add = (id, source) => {
    if (active.has(id) && !direct.has(id))
      direct.set(id, { id, direct: true, strength: 1, source });
  };
  for (const tag of [
    ...(anime.genres || []),
    ...(anime.themes || []),
    ...(anime.demographics || []),
  ])
    add(nodeForLabel(typeof tag === "string" ? tag : tag?.name), "Catalog tag");
  add(formats[anime.format], "Release format");
  add(origins[key(anime.adaptationSource)], "Adaptation source");
  // No synopsis keyword guesses, report-example assignments or opinions as facts.
  const result = new Map(direct);
  for (const [id] of direct)
    for (const [parent, depth] of ancestorDepths(id)) {
      const strength = 0.45 ** depth;
      if (!result.has(parent) || result.get(parent).strength < strength)
        result.set(parent, {
          id: parent,
          direct: false,
          strength,
          source: "Subtype of " + TAXONOMY_BY_ID.get(id).label,
        });
    }
  cache.set(anime, result);
  return result;
}
export function taxonomyFeatures(anime) {
  // Raw release format already has a model feature. All other supported facets
  // can inform explicit category interests, including presentation and source.
  const memberships = [...taxonomyMemberships(anime).values()].filter(
    (m) => m.source !== "Release format",
  );
  const norm = Math.hypot(...memberships.map((m) => m.strength)) || 1;
  return memberships.map((m) => [
    "taxonomy:" + m.id,
    (0.35 * m.strength) / norm,
  ]);
}
export function matchesTaxonomy(anime, ids) {
  const selected = cleanNodeIds(ids);
  if (!selected.length) return true;
  const known = taxonomyMemberships(anime);
  return selected.some((id) => known.has(id));
}
// Breadth-first paths, bounded for display. Related and grouping links are never
// presented as evidence that a title belongs to a parent category.
export function taxonomyPaths(id) {
  const paths = [],
    queue = [[id]];
  for (let i = 0; i < queue.length && paths.length < 3 && i < 64; i++) {
    const path = queue[i],
      up = nodeParents(path[0]).filter(
        (e) => e.type === "subtype" && active.has(e.parent),
      );
    if (!up.length) paths.push(path);
    else for (const e of up) queue.push([e.parent, ...path]);
  }
  return paths;
}
export function taxonomyCardRows(anime) {
  return [...taxonomyMemberships(anime).values()]
    .filter(
      (m) =>
        m.direct && TAXONOMY_BY_ID.get(m.id).facet !== "Format / Production",
    )
    .map((m) => ({
      ...m,
      node: TAXONOMY_BY_ID.get(m.id),
      paths: taxonomyPaths(m.id),
    }));
}

export const formatForNode = (id) =>
  Object.entries(formats).find(([, node]) => node === id)?.[0] || null;
