import { readFile, writeFile } from "node:fs/promises";
// Reviewed membership implications. Other research edges are retained for browsing
// only; being acyclic is not evidence that a classification is universally true.
const strict = `
comedy:dark-comedy comedy:gag-humor comedy:slapstick comedy:romantic-comedy
romance:romantic-comedy love-polygon:love-triangle
mecha:real-robot mecha:super-robot
fantasy:dark-fantasy fantasy:urban-fantasy fantasy:contemporary-fantasy
contemporary-fantasy:urban-fantasy
sports:team-sports sports:combat-sports
sports:gymnastics sports:racing sports:tennis
team-sports:baseball team-sports:soccer team-sports:volleyball
combat-sports:boxing combat-sports:wrestling
arts:performing-arts arts:visual-arts arts:music performing-arts:dancing
crime:organized-crime game:video-game game:strategy-game game:gambling
video-game:mmorpg
livestreamers:vtubers idols:idols-female idols:idols-male
robots-mecha:androids robots-mecha:combining-mecha robots-mecha:sentient-mecha robots-mecha:transforming-mecha
mahou-shoujo:magic-idol-singers idols:magic-idol-singers music:magic-idol-singers
school:art-school school:college school:magic-school school:martial-arts-school
school:military-school school:music-school school:school-club club:school-club
science-fiction:cyberpunk science-fiction:space-opera science-fiction:science-fantasy
fantasy:science-fantasy space:space-opera
historical:feudal-japan historical:prehistoric historical:world-war-ii
episodic:monster-of-the-week isekai:reverse-isekai isekai:summoned-into-another-world
isekai:transported-into-a-novel video-game:trapped-in-a-video-game
cg-animation:flash-animation action-scenes:gunfights action-scenes:swordplay
based-on-manga:based-on-4-koma-manga based-on-novel:based-on-light-novel
based-on-novel:based-on-web-novel based-on-comic-book:based-on-webtoon
`
  .trim()
  .split(/\s+/);
const source = JSON.parse(
  await readFile("notes/taxonomy/research-source.json", "utf8"),
);
const nodes = source.nodes.map(
  ({ id, label, facet, kind, aliases, definition, status, safety }) => ({
    id,
    label,
    facet,
    kind,
    aliases,
    definition,
    status,
    safety,
  }),
);
const byId = new Map(nodes.map((n) => [n.id, n]));
if (byId.size !== nodes.length) throw Error("Duplicate node");
const edges = source.edges.map((e) => ({
  parent: e.parent_id,
  child: e.child_id,
  type:
    byId.get(e.parent_id)?.kind === "structural"
      ? "group"
      : strict.includes(`${e.parent_id}:${e.child_id}`)
        ? "subtype"
        : "related",
}));
for (const key of strict) {
  const [parent, child] = key.split(":");
  if (!edges.some((e) => e.parent === parent && e.child === child))
    edges.push({ parent, child, type: "subtype" });
}
const incoming = new Map(nodes.map((n) => [n.id, 0])),
  children = new Map(nodes.map((n) => [n.id, []]));
const seen = new Set();
for (const e of edges) {
  if (!byId.has(e.parent) || !byId.has(e.child)) throw Error("Dangling edge");
  const key = `${e.parent}:${e.child}`;
  if (seen.has(key)) throw Error("Duplicate edge");
  seen.add(key);
  incoming.set(e.child, incoming.get(e.child) + 1);
  children.get(e.parent).push(e.child);
}
const order = [...incoming].filter(([, n]) => n === 0).map(([id]) => id);
for (let i = 0; i < order.length; i++)
  for (const id of children.get(order[i])) {
    incoming.set(id, incoming.get(id) - 1);
    if (!incoming.get(id)) order.push(id);
  }
if (order.length !== nodes.length) throw Error("Cycle");
const data = { version: "2026-10-18-reviewed-1", nodes, edges };
await writeFile("src/lib/anime-taxonomy-data.json", JSON.stringify(data));
const counts = Object.fromEntries(
  ["group", "subtype", "related"].map((t) => [
    t,
    edges.filter((e) => e.type === t).length,
  ]),
);
await writeFile(
  "notes/taxonomy/audit.json",
  JSON.stringify(
    {
      sourceVersion: source.metadata.version,
      sourceWarning: source.metadata.warning,
      nodeCount: nodes.length,
      sourceEdges: source.edges.length,
      productionEdges: edges.length,
      definitionsPresent: nodes.filter((n) => n.definition).length,
      counts,
      acyclic: true,
      topologicalOrder: order,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({ nodes: nodes.length, edges: edges.length, ...counts }),
);
