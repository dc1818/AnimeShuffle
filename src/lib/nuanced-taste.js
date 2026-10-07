import { RESEARCH_TRAITS } from "./research-taxonomy.js";
/** Shared, versioned vocabulary. Presence, prominence and reviewer opinion are
 * separate evidence: a synopsis cannot establish animation or writing quality. */
export const NUANCE_VERSION = 1;
const cue = (key, label, pattern, tags = [], reviewOnly = false) => ({
  key,
  label,
  pattern,
  tags,
  reviewOnly,
});
export const NUANCES = [
  cue(
    "animation-execution",
    "well-executed animation",
    /(?:animation|animated scenes?)\s+(?:(?:is|are|looks?|feels?|remains?)\s+)?(?:(?:very|really|quite|pretty|consistently|particularly|simply|absolutely)\s+){0,2}(?:good|great|excellent|beautiful|superb|amazing|impressive)|(?:good|great|excellent|beautiful|superb|amazing|impressive)(?:\s+(?:art|visuals)\s+and)?\s+animation/i,
    [],
    true,
  ),
  cue(
    "character-writing",
    "well-developed characters",
    /(?:well.written|well.developed|layered|complex|nuanced|compelling)\s+(?:(?:main|supporting|female|male)\s+)?characters?|characters?\s+(?:are|is|feel|feels)\s+(?:very |really |all )?(?:well.written|well.developed|layered|complex|nuanced|compelling)/i,
    [],
    true,
  ),
  cue(
    "shallow-characters",
    "lightly developed characters",
    /(?:flat|one.dimensional|underdeveloped|uninteresting|forgettable|soulless)\s+characters?|characters?\s+(?:are|is|feel|feels)\s+(?:very |really |all )?(?:flat|one.dimensional|underdeveloped|uninteresting|forgettable|soulless)/i,
    [],
    true,
  ),
  cue(
    "rich-world",
    "a richly developed world",
    /(?:world.building|world building)\s+(?:is|feels|remains)\s+(?:very |really )?(?:strong|excellent|rich|detailed|immersive)|(?:strong|excellent|rich|detailed|immersive|intricate)\s+(?:world.building|world|setting)/i,
    [],
    true,
  ),
  cue(
    "memorable-music",
    "a memorable soundtrack",
    /(?:soundtrack|music|ost|musical score)\s+(?:is|sounds|feels)\s+(?:very |really |quite |simply )?(?:great|excellent|memorable|beautiful|outstanding|amazing)|(?:great|excellent|memorable|beautiful|outstanding|amazing)\s+(?:soundtrack|music|ost|musical score)/i,
    [],
    true,
  ),
  cue(
    "mecha-central",
    "stories centered on piloted mechs",
    /(?:mech\w*|robot\w*|mobile suits?).{0,60}(?:central|main focus|core|dominat)|(?:center\w*|focus\w*|revolves?|primarily).{0,45}(?:mech\w*|robot combat|mobile suits?)/i,
  ),
  cue(
    "mecha-incidental",
    "mechs in a supporting role",
    /(?:mech\w*|robots?).{0,55}(?:incidental|occasional|background|supporting|small part|not the focus)|(?:occasional|incidental|background).{0,30}(?:mech\w*|robots?)/i,
  ),
  cue(
    "isekai-reincarnation",
    "starting a new life through reincarnation",
    /(?:reincarnat\w*|reborn).{0,70}(?:world|fantasy|game|villainess)/i,
    ["Reincarnation"],
  ),
  cue(
    "isekai-transport",
    "being transported to another world",
    /(?:transport\w*|teleport\w*|sent|stranded).{0,65}(?:another|different|fantasy|parallel) world/i,
  ),
  cue(
    "isekai-summoned",
    "being summoned to another world",
    /summon\w*.{0,65}(?:world|hero|kingdom)/i,
  ),
  cue(
    "isekai-otome",
    "life inside an otome game",
    /\botome\b|(?:dating|romance) (?:sim|game).{0,60}(?:world|reborn|villainess|reincarnat)/i,
  ),
  cue(
    "isekai-game",
    "life inside a game world",
    /(?:trapped|live|living|transport\w*|reborn).{0,55}(?:video game|game world|virtual world|MMORPG)/i,
  ),
  cue(
    "reverse-isekai",
    "fantasy characters entering the ordinary world",
    /\breverse isekai\b|(?:demon|fantasy|otherworldly).{0,55}(?:modern Japan|our world|modern world)/i,
  ),
  cue(
    "magic-academy",
    "learning magic at an academy",
    /(?:magic\w*|wizard\w*|sorcer\w*).{0,35}(?:academy|school)|(?:academy|school).{0,35}(?:magic|wizard|sorcer)/i,
  ),
  cue(
    "outcast-ascent",
    "an outsider challenging an unfair hierarchy",
    /(?:outcast|powerless|no magic|without magic|lowest rank|discriminat\w*).{0,100}(?:rise|rises|proves?|overcome|defy|challenge|become|climb)/i,
  ),
  cue(
    "earned-progression",
    "abilities earned through practice and setbacks",
    /(?:earn\w*|train\w*|practic\w*|setbacks?).{0,65}(?:strength|skills?|abilities|power|improv\w*)/i,
  ),
  cue(
    "effortless-power",
    "overwhelming power from the outset",
    /(?:overpower\w*|invincible|effortless\w*|unbeatable).{0,65}(?:hero|lead|protagonist|defeat|power)|(?:hero|lead|protagonist).{0,65}(?:overpower\w*|invincible|effortless\w*)/i,
  ),
  cue(
    "rule-based-powers",
    "powers with clear rules and trade-offs",
    /(?:magic|powers?|abilities).{0,70}(?:rules|limitations|trade.offs|costs)|(?:rules|limitations|trade.offs).{0,50}(?:magic|powers?|abilities)/i,
  ),
  cue(
    "inventive-abilities",
    "unusual uses of character abilities",
    /(?:inventive|creative|unusual|distinctive).{0,40}(?:abilities|powers|skill)|(?:abilities|powers).{0,40}(?:inventive|creative|unusual)/i,
    [],
    true,
  ),
  cue(
    "villain-design",
    "striking villain designs",
    /(?:villains?|antagonists?).{0,65}(?:striking|stylish|distinctive|memorable|cool).{0,25}(?:design|look|appearance)|(?:striking|stylish|distinctive).{0,35}(?:villain|antagonist).{0,20}design/i,
    [],
    true,
  ),
  cue(
    "villain-motivation",
    "villains with developed motives",
    /(?:villains?|antagonists?).{0,65}(?:nuanced|complex|believable|understandable|developed).{0,25}(?:motive|motivation)|(?:complex|believable|developed).{0,25}(?:motive|motivation).{0,45}(?:villain|antagonist)/i,
    [],
    true,
  ),
  cue(
    "intimidating-presence",
    "characters with an intimidating presence",
    /(?:characters?|villains?|antagonists?).{0,50}(?:intimidating|menacing|commanding) presence/i,
    [],
    true,
  ),
  cue(
    "muscular-design",
    "large, muscular character designs",
    /(?:muscular|burly|hulking|brawny).{0,30}(?:characters?|heroes|protagonists?|designs?)/i,
    [],
    true,
  ),
  cue(
    "distinctive-design",
    "distinctive character designs",
    /(?:distinctive|unusual|striking|stylish).{0,30}(?:character designs?|visual style)|character designs?.{0,40}(?:distinctive|unusual|striking|stylish)/i,
    [],
    true,
  ),
  cue(
    "chibi-dominant",
    "a predominantly chibi art style",
    /(?:primarily|entirely|mostly|predominantly|throughout).{0,35}chibi|chibi.{0,45}(?:throughout|main art style|dominates)/i,
    [],
    true,
  ),
  cue(
    "chibi-gags",
    "occasional chibi comedy cutaways",
    /(?:occasional|brief|comedic|comedy).{0,35}chibi|chibi.{0,35}(?:cutaways|gags|occasional)/i,
    [],
    true,
  ),
  cue(
    "stealth-action",
    "stealth, infiltration and espionage",
    /\b(espionage|covert missions?|stealth missions?|infiltrat\w*|undercover operati\w*)\b/i,
  ),
  cue(
    "supernatural-ninjas",
    "ninja battles with supernatural powers",
    /(?:ninja|shinobi).{0,70}(?:supernatural|chakra|superpowers|magical|jutsu)/i,
  ),
  cue(
    "sports-central",
    "competitive sports as the main story",
    /(?:sports?|volleyball|football|basketball|baseball|soccer|tennis).{0,70}(?:team|tournament|championship|competition|career)/i,
    ["Sports", "Team Sports"],
  ),
  cue(
    "combat-sport",
    "competitive combat sports",
    /\b(boxing|kickboxing|wrestling|mixed martial arts)\b/i,
    ["Combat Sports"],
  ),
  cue(
    "martial-technique",
    "martial arts and fighting technique",
    /\b(martial arts|kung fu|karate|judo|hand.to.hand combat)\b/i,
    ["Martial Arts"],
  ),
  cue(
    "tournament-structure",
    "a story built around tournaments",
    /(?:tournaments?|championship).{0,45}(?:arc|structure|central|main focus)|(?:revolves?|center\w*).{0,45}(?:tournaments?|championship)/i,
  ),
  cue(
    "romance-central",
    "romance as the main story",
    /(?:romance|romantic relationship).{0,55}(?:central|main focus|drives the story|core)|(?:focus\w*|revolves?|center\w*).{0,40}(?:romance|romantic relationship)/i,
  ),
  cue(
    "romance-subplot",
    "romance woven into a larger story",
    /(?:romance|romantic).{0,40}(?:subplot|supporting|background|sprinkled|small part)|(?:minor|background|subtle|occasional).{0,30}romance/i,
  ),
  cue(
    "romance-progress",
    "relationships that move forward",
    /(?:romance|couple|relationship).{0,60}(?:progress\w*|develops steadily|moves? forward|honest communication)/i,
    [],
    true,
  ),
  cue(
    "romance-stalling",
    "prolonged romantic indecision",
    /(?:romance|relationship|confession).{0,60}(?:stall\w*|drag\w*|no progress|never progresses)|\bwill.they.won.t.they\b/i,
    ["Love Status Quo"],
    true,
  ),
  cue(
    "love-polygon",
    "competing romantic interests",
    /\blove (?:triangle|polygon)|multiple (?:love interests|romantic rivals)\b/i,
    ["Love Polygon", "Harem", "Reverse Harem"],
  ),
  cue(
    "established-couple",
    "an established couple",
    /\b(already dating|established couple|married couple|newlyweds)\b/i,
  ),
  cue(
    "romantic-jealousy",
    "romantic jealousy and rivalry",
    /(?:romantic|relationship|love).{0,45}(?:jealousy|rivalry)|(?:jealousy).{0,45}(?:romance|relationship)/i,
  ),
  cue(
    "female-perspective",
    "a story told from a female lead’s perspective",
    /(?:female (?:lead|protagonist)|heroine).{0,55}(?:perspective|point of view|narrat)/i,
  ),
  cue(
    "political-intrigue",
    "political maneuvering and intrigue",
    /\b(political intrigue|power struggles?|court politics|political maneuver\w*)\b/i,
  ),
  cue(
    "moral-dilemmas",
    "difficult moral trade-offs",
    /\b(moral dilemmas?|ethical dilemmas?|impossible moral choices|morally ambiguous)\b/i,
  ),
  cue(
    "procedural",
    "self-contained cases and investigations",
    /\b(procedural|case.of.the.week|self.contained cases)\b/i,
  ),
  cue(
    "long-payoffs",
    "long-running mysteries and delayed payoffs",
    /(?:long.running|slow.building|overarching).{0,35}myster|(?:foreshadow\w*|setup).{0,45}(?:payoff|pays off)/i,
    [],
    true,
  ),
  cue(
    "low-stakes-comfort",
    "gentle, low-stakes everyday stories",
    /\b(low.stakes|iyashikei|healing anime|gentle everyday|relaxing slice.of.life)\b/i,
    ["Iyashikei"],
  ),
  cue(
    "bleak-tone",
    "a bleak, unforgiving tone",
    /\b(bleak|nihilistic|unrelentingly grim|hopeless atmosphere)\b/i,
  ),
  cue(
    "hopeful-resilience",
    "hope and resilience through hardship",
    /(?:hope|hopeful|optimism|resilien\w*).{0,65}(?:hardship|adversity|struggle|tragedy)/i,
  ),
  cue(
    "absurdist-comedy",
    "absurdist and surreal comedy",
    /\b(absurdist|surreal comedy|absurd humor|absurd humour)\b/i,
  ),
  cue("deadpan-comedy", "deadpan humor", /\b(deadpan|dry humor|dry humour)\b/i),
  cue(
    "social-satire",
    "satire of society and institutions",
    /(?:satir\w*).{0,55}(?:society|social|politic|bureaucracy|institutions)/i,
  ),
  cue(
    "subtext",
    "meaning conveyed through subtext",
    /\b(subtext|implicit motivations?|unspoken motivations?|show.don.t.tell)\b/i,
    [],
    true,
  ),
  cue(
    "ironic-distance",
    "irony and unreliable perspectives",
    /\b(dramatic irony|unreliable narrator|ironic detachment)\b/i,
    [],
    true,
  ),
  cue(
    "ensemble-agency",
    "supporting characters with independent goals",
    /(?:supporting characters?|ensemble).{0,70}(?:own goals|independent|agency|own motivations)/i,
    [],
    true,
  ),
  cue(
    "formulaic-writing",
    "familiar formulas and predictable conflicts",
    /\b(formulaic|uninspired|predictable plot|generic abilities|stock characters)\b/i,
    [],
    true,
  ),
  cue(
    "experimental-form",
    "experimental storytelling and presentation",
    /\b(experimental storytelling|unconventional narrative|avant.garde|nonlinear narrative)\b/i,
    ["Avant Garde", "Experimental"],
  ),
  cue(
    "fluid-combat",
    "fluid, readable action choreography",
    /(?:fight\w*|combat|action).{0,60}(?:fluid|readable|well.choreographed|clear choreography)|(?:fluid|readable|well.choreographed).{0,35}(?:fight|combat|action)/i,
    [],
    true,
  ),
  cue(
    "limited-motion",
    "limited animation and static action",
    /\b(limited animation|static action|slideshow animation|still frames during fights)\b/i,
    [],
    true,
  ),
  cue(
    "stretched-pacing",
    "a story stretched across episodes",
    /\b(padded episodes?|stretched pacing|drags? out|dragged out|slow plot progression)\b/i,
    [],
    true,
  ),
  cue(
    "brisk-progress",
    "a plot that moves briskly",
    /\b(brisk pacing|fast.moving plot|little downtime|rapid story progression)\b/i,
    [],
    true,
  ),
  cue(
    "soundtrack-atmosphere",
    "music that builds atmosphere",
    /(?:music|soundtrack|score).{0,60}(?:atmospheric|immersive|builds atmosphere|sets the mood)/i,
    [],
    true,
  ),
];
export const NUANCE_BY_KEY = new Map(NUANCES.map((n) => [n.key, n]));
export const OPPOSITES = [
  ["character-writing", "shallow-characters"],
  ["mecha-central", "mecha-incidental"],
  ["romance-central", "romance-subplot"],
  ["romance-progress", "romance-stalling"],
  ["chibi-dominant", "chibi-gags"],
  ["fluid-combat", "limited-motion"],
  ["stretched-pacing", "brisk-progress"],
];
export const SPOILER_CUE =
  /\b(spoilers?|ending|finale|dies|death|killer|reveal\w*|plot twist|betray\w*|turns out|secret identity|last episode)\b/i;
export function safeClauses(text = "") {
  return text
    .slice(0, 24000)
    .replace(/<[^>]*>/g, " ")
    .replace(/[’']/g, "'")
    .replace(/\b(isn|wasn|aren|weren|doesn|didn)'t\b/gi, "$1 not")
    .split(/(?<=[.!?;])\s+|\n+|\bbut\b|\bhowever\b/i)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length >= 8 &&
        s.length <= 600 &&
        !SPOILER_CUE.test(s) &&
        !/\b(unlike|compared to|better than|worse than|sarcasm|sarcastic)\b|yeah[ ,]+right|as if/i.test(
          s,
        ),
    );
}
// Explicit "not the focus" is useful prominence evidence, not a blanket denial.
function affirms(s, key) {
  s =
    key === "outcast-ascent"
      ? s.replace(/no magic|without magic|without powers/gi, "powerless")
      : s;
  s = s.replace(/not only/gi, "");
  const clean =
    key.endsWith("incidental") || key.endsWith("stalling")
      ? s.replace(/not the focus|no progress|never progresses/gi, "")
      : s;
  return !/\b(no|not|never|hardly|barely|lacks?|without)\b/i.test(clean);
}
export function allowedReviewRows(rows = []) {
  const authors = new Set(),
    texts = new Set();
  return rows.slice(0, 30).filter((row) => {
    if (
      row?.is_spoiler !== false ||
      row?.is_preliminary !== false ||
      typeof row.review !== "string"
    )
      return false;
    const author = row.user?.username?.trim().toLowerCase();
    const text = row.review.toLowerCase().replace(/\s+/g, " ").trim();
    if (!author || authors.has(author) || texts.has(text)) return false;
    authors.add(author);
    texts.add(text);
    return true;
  });
}
export function analyzeNuances(rows) {
  const evidence = allowedReviewRows(rows).map((row) =>
    safeClauses(row.review),
  );
  const observations = [];
  for (const n of NUANCES) {
    let support = 0,
      denied = 0;
    for (const clauses of evidence) {
      const matches = clauses.filter((s) => n.pattern.test(s));
      if (matches.some((s) => !affirms(s, n.key))) denied++;
      else if (matches.length) support++;
    }
    // Mixed reception stays visible as disagreement, rather than disappearing.
    if (support + denied >= 2)
      observations.push({
        key: n.key,
        support,
        denied,
        confidence: +(support / (support + denied + 4)).toFixed(3),
      });
  }
  return { version: NUANCE_VERSION, observations };
}
const memo = new WeakMap();
export function nuancedTraits(anime) {
  if (memo.has(anime)) return memo.get(anime);
  const out = new Map(),
    clauses = safeClauses(anime.synopsis || "");
  for (const n of NUANCES) {
    const tagged = n.tags.some((t) => (anime.genres || []).includes(t));
    if (
      tagged ||
      (!n.reviewOnly &&
        clauses.some((s) => n.pattern.test(s) && affirms(s, n.key)))
    )
      out.set(n.key, {
        description: n.label,
        strength: tagged ? 0.85 : 0.6,
        source: tagged ? "metadata" : "synopsis",
      });
  }
  const profile = anime.reviewTaste?.nuance;
  if (profile?.version === NUANCE_VERSION)
    for (const o of (profile.observations || []).slice(0, NUANCES.length)) {
      const n = NUANCE_BY_KEY.get(o.key);
      if (
        !n ||
        !Number.isInteger(o.support) ||
        o.support < 3 ||
        !Number.isInteger(o.denied) ||
        o.denied < 0 ||
        o.support / (o.support + o.denied) < 0.75
      )
        continue;
      const strength = Math.min(0.9, o.support / (o.support + o.denied + 4));
      if (strength > (out.get(o.key)?.strength || 0) || !out.has(o.key))
        out.set(o.key, {
          description: n.label,
          strength,
          source: "reviews",
          support: o.support,
        });
    }
  // Research evidence stays separate from review-vote counts. Only validated
  // numeric attributes reach clients; free-form notes never become explanations.
  if (anime.researchTaste?.version === 1) {
    const labels = new Map(
      [...NUANCES, ...RESEARCH_TRAITS].map((n) => [n.key, n.label]),
    );
    for (const o of (anime.researchTaste.observations || []).slice(
      0,
      labels.size,
    )) {
      if (
        !labels.has(o.key) ||
        !Number.isFinite(o.score) ||
        o.score < 0 ||
        o.score > 1 ||
        !Number.isFinite(o.confidence) ||
        o.confidence < 0.45 ||
        o.confidence > 1
      )
        continue;
      if (o.score <= 0.1 && o.confidence >= 0.8) {
        out.delete(o.key);
        continue;
      }
      if (o.score < 0.3) continue;
      const prominence = { central: 1, supporting: 0.8, incidental: 0.45 }[
        o.prominence
      ];
      if (!prominence) continue;
      out.set(o.key, {
        description: labels.get(o.key),
        strength: Math.min(0.9, o.score * o.confidence * prominence),
        source: "research",
      });
    }
  }
  // Contradictory prominence estimates should not manufacture a precise match.
  for (const [a, b] of OPPOSITES)
    if (out.has(a) && out.has(b)) {
      out.delete(a);
      out.delete(b);
    }
  const ep = anime.episodeTaste;
  if (
    ep?.complete &&
    ep.total >= 1 &&
    ep.filler >= 0 &&
    ep.filler <= ep.total
  ) {
    const fraction = ep.filler / ep.total;
    out.set(fraction >= 0.15 ? "filler-frequent" : "filler-sparse", {
      description:
        fraction >= 0.15
          ? "frequent episodes marked as filler"
          : "few episodes marked as filler",
      strength: 0.8,
      source: "episodes",
    });
  }
  memo.set(anime, out);
  return out;
}
export function nuancedFeatures(anime) {
  const traits = nuancedTraits(anime),
    f = [];
  const sorted = [...traits].sort(
    (a, b) => b[1].strength - a[1].strength || a[0].localeCompare(b[0]),
  );
  for (const [key, t] of sorted)
    f.push([
      "nuance:" + key,
      (0.95 * t.strength) / Math.sqrt(Math.max(1, traits.size)),
    ]);
  // Conjunctions learn context, so liking magic-school underdogs need not imply
  // liking every school show, and good mech action can differ from generic mecha.
  const keys = sorted
    .slice(0, 8)
    .map(([k]) => k)
    .sort();
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++)
      f.push([
        `nuanceblend:${keys[i]}:${keys[j]}`,
        (0.4 *
          Math.sqrt(
            traits.get(keys[i]).strength * traits.get(keys[j]).strength,
          )) /
          Math.sqrt(Math.max(1, keys.length - 1)),
      ]);
  return { traits, features: f };
}
