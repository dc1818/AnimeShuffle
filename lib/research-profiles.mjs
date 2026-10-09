import { createHash } from "node:crypto";
import { AppError } from "./mal.mjs";
import { NUANCES } from "../src/lib/nuanced-taste.js";
import { researchImpact } from "../src/lib/research-impact.js";
import { mergeResearchProfile } from "./research-merge.mjs";
import {
  TRAIT_FAMILIES,
  TRAIT_CATALOG_VERSION,
} from "../src/lib/extended-research-traits.js";
import {
  RESEARCH_TRAITS,
  ANALYSIS_GUIDE,
  RESEARCH_QUESTIONS,
} from "../src/lib/research-taxonomy.js";

export const RESEARCH_SCHEMA = 1;
export const RESEARCH_IMPORT_LIMIT = Number.MAX_SAFE_INTEGER;
export const RESEARCH_UPLOAD_BYTES = 16 * 1024 * 1024;
export const RESEARCH_AREAS = [
  "premise",
  "world",
  "characters",
  "powers",
  "relationships",
  "conflict",
  "structure",
  "pacing",
  "tone",
  "comedy",
  "presentation",
  "music",
];
export const researchVocabulary = [
  ...NUANCES.map((n) => ({
    key: n.key,
    label: n.label,
    category: "Detailed tastes",
    evidenceOnly: n.reviewOnly,
  })),
  ...RESEARCH_TRAITS,
];
const vocabulary = new Map(researchVocabulary.map((n) => [n.key, n]));
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (message) => {
  throw new AppError(message, 400, "research_invalid");
};
const text = (v, max, field) => {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /[<>\u0000-\u0008]/.test(v)
  )
    fail(`Invalid ${field}.`);
  return v.trim();
};
const id = (v) => Number.isSafeInteger(v) && v > 0 && v <= 10000000;
const date = (v) =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  Date.parse(v) <= Date.now() + 86400000;
const score = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const list = (v, max, field) => {
  if (!Array.isArray(v) || v.length > max) fail(`Invalid ${field}.`);
  return v;
};
const sourceTypes = [
  "official",
  "synopsis",
  "review",
  "editorial",
  "production",
  "episode-guide",
];

// The role comes only from deployment configuration plus an authenticated ID.
// Registration, usernames, imported JSON and client flags cannot grant access.
export function isResearchAdmin(account, allowlist = "") {
  return (
    !!account?.id &&
    String(allowlist)
      .split(/[\s,]+/)
      .filter(Boolean)
      .includes(account.id)
  );
}
export function publicAnime(a) {
  if (!id(a?.id) || typeof a.title !== "string") return null;
  return {
    id: a.id,
    title: a.title.slice(0, 300),
    englishTitle: String(a.englishTitle || "").slice(0, 300),
    japaneseTitle: String(a.japaneseTitle || "").slice(0, 300),
    synonyms: (a.synonyms || []).filter((v) => typeof v === "string").slice(0, 100),
    year: Number.isSafeInteger(a.year) && a.year > 0 ? a.year : null,
    duration: Number.isFinite(a.duration) ? a.duration : null,
    studios: (a.studios || []).filter((v) => typeof v === "string").slice(0, 40),
    synopsis: String(a.synopsis || "").slice(0, 12000),
    genres: (a.genres || []).filter((g) => typeof g === "string").slice(0, 40),
    format: String(a.format || "").slice(0, 30),
    status: String(a.status || "").slice(0, 40),
    episodes: Number.isSafeInteger(a.episodes) ? a.episodes : 0,
  };
}
export function animeFingerprint(a) {
  const p = publicAnime(a);
  return hash(
    p && {
      title: p.title,
      synopsis: p.synopsis,
      status: p.status,
      episodes: p.episodes,
    },
  );
}

/** Only explicit fields survive validation. No imported roles, SQL, raw reviews,
 * code, URLs to fetch, or arbitrary user-visible explanations are accepted. */
export function validateResearchBundle(bundle) {
  if (
    bundle?.format !== "anime-shuffle-research" ||
    bundle.schemaVersion !== RESEARCH_SCHEMA
  )
    fail("Choose an Anime Shuffle research export with schema version 1.");
  const used = new Set();
  const profiles = list(bundle.profiles, RESEARCH_IMPORT_LIMIT, "profiles").map(
    (p) => {
      if (!id(p?.malId) || used.has(p.malId))
        fail("Anime IDs must be unique positive MAL IDs.");
      used.add(p.malId);
      if (!date(p.analyzedAt)) fail(`Invalid analysis date for ${p.malId}.`);
      if (!["preliminary", "researched"].includes(p.status))
        fail("Profile status must be preliminary or researched.");
      if (
        p.metadataFingerprint !== null &&
        !/^[a-f0-9]{64}$/.test(p.metadataFingerprint || "")
      )
        fail(
          "Missing metadata fingerprint; use null only when no catalog export was available.",
        );
      const sourceIds = new Set();
      const sources = list(p.sources, 200, "sources").map((s) => {
        const sourceId = text(s.id, 40, "source ID");
        if (sourceIds.has(sourceId)) fail("Duplicate source ID.");
        sourceIds.add(sourceId);
        let u;
        try {
          u = new URL(s.url);
        } catch {
          fail("Invalid source URL.");
        }
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          u.href.length > 1500 ||
          !sourceTypes.includes(s.type) ||
          !date(s.accessedAt)
        )
          fail(
            "Sources require public HTTPS URLs, a valid type and access date.",
          );
        return {
          id: sourceId,
          url: u.href,
          title: text(s.title, 200, "source title"),
          type: s.type,
          ...(s.independenceKey !== undefined
            ? {
                independenceKey: text(
                  s.independenceKey,
                  80,
                  "source independence key",
                ),
              }
            : {}),
          accessedAt: s.accessedAt,
        };
      });
      if (!sources.length) fail("Each profile requires evidence sources.");
      const keys = new Set();
      const observations = list(
        p.observations,
        researchVocabulary.length,
        "observations",
      ).map((o) => {
        const term = vocabulary.get(o.key);
        if (!term || keys.has(o.key))
          fail(`Unknown or duplicate trait: ${String(o.key).slice(0, 60)}.`);
        keys.add(o.key);
        if (
          o.containsSpoilers !== undefined &&
          typeof o.containsSpoilers !== "boolean"
        )
          fail("Trait containsSpoilers must be a boolean.");
        if ((o.score !== null && !score(o.score)) || !score(o.confidence))
          fail(
            "Trait scores and confidence must be between 0 and 1, or score null for unknown.",
          );
        if (
          !["central", "supporting", "incidental", "unknown"].includes(
            o.prominence,
          ) ||
          !["premise", "critical", "production"].includes(o.basis)
        )
          fail("Invalid trait prominence or evidence basis.");
        const refs = [...new Set(list(o.sources, 200, "trait sources"))];
        if (
          refs.some((ref) => !sourceIds.has(ref)) ||
          (o.score !== null && !refs.length)
        )
          fail("Every assessed trait needs valid source references.");
        if (
          term.evidenceOnly &&
          o.score !== null &&
          (o.basis === "premise" ||
            !refs.some((ref) =>
              ["review", "editorial", "production"].includes(
                sources.find((s) => s.id === ref).type,
              ),
            ))
        )
          fail(`${o.key} cannot be inferred from a synopsis.`);
        const independent = new Set(
          refs.map(
            (ref) =>
              sources.find((s) => s.id === ref).independenceKey ||
              new URL(sources.find((s) => s.id === ref).url).hostname.replace(
                /^www\./,
                "",
              ),
          ),
        ).size;
        // One review is an opinion, not consensus. Keep it, with bounded influence.
        const confidence =
          o.basis === "critical" && independent < 2
            ? Math.min(0.55, o.confidence)
            : o.confidence;
        return {
          key: o.key,
          score: o.score,
          confidence,
          prominence: o.prominence,
          basis: o.basis,
          sources: refs,
          evidence: text(o.evidence, 600, "evidence summary"),
          // New granular findings require an explicit spoiler-safety decision.
          // Older uploads retain their existing controlled-label behavior.
          ...(term.familyKey || o.containsSpoilers !== undefined
            ? {
                containsSpoilers: term.familyKey
                  ? o.containsSpoilers !== false
                  : o.containsSpoilers,
              }
            : {}),
          ...(o.supersedes === true ? { supersedes: true } : {}),
        };
      });
      if (!observations.length)
        fail("A profile needs at least one assessed or unknown trait.");
      // Extensible evidence notes survive future ranking-taxonomy changes. They
      // are owner research, never executable ranking rules or public copy.
      const dimensionKeys = new Set();
      const dimensions = list(
        p.dimensions || [],
        400,
        "research dimensions",
      ).map((d) => {
        if (
          !RESEARCH_AREAS.includes(d.area) ||
          !/^[a-z][a-z0-9-]{0,79}$/.test(d.key || "") ||
          dimensionKeys.has(d.key)
        )
          fail("Invalid or duplicate research dimension.");
        dimensionKeys.add(d.key);
        if (
          !["premise", "critical", "production"].includes(d.basis) ||
          !score(d.confidence)
        )
          fail("Invalid dimension evidence basis.");
        const refs = [...new Set(list(d.sources, 200, "dimension sources"))];
        if (!refs.length || refs.some((ref) => !sourceIds.has(ref)))
          fail("Every research dimension needs source references.");
        if (
          ["presentation", "music", "pacing"].includes(d.area) &&
          d.basis === "premise"
        )
          fail("Execution dimensions cannot come from a synopsis.");
        if (
          d.basis === "critical" &&
          !refs.some((ref) =>
            ["review", "editorial", "production"].includes(
              sources.find((s) => s.id === ref).type,
            ),
          )
        )
          fail("Critical dimensions require critical sources.");
        const independent = new Set(
          refs.map(
            (ref) =>
              sources.find((s) => s.id === ref).independenceKey ||
              new URL(sources.find((s) => s.id === ref).url).hostname.replace(
                /^www\./,
                "",
              ),
          ),
        ).size;
        return {
          key: d.key,
          area: d.area,
          description: text(d.description, 600, "dimension description"),
          basis: d.basis,
          confidence:
            d.basis === "critical" && independent < 2
              ? Math.min(0.55, d.confidence)
              : d.confidence,
          sources: refs,
          containsSpoilers: d.containsSpoilers === true,
        };
      });
      const coverageAreas = new Set();
      const coverage = list(
        p.coverage || [],
        RESEARCH_AREAS.length,
        "coverage",
      ).map((c) => {
        if (
          !RESEARCH_AREAS.includes(c.area) ||
          coverageAreas.has(c.area) ||
          ![
            "supported",
            "partial",
            "unknown",
            "not-researched",
            "insufficient-evidence",
            "disputed",
            "not-applicable",
          ].includes(c.state)
        )
          fail("Invalid research coverage.");
        coverageAreas.add(c.area);
        return {
          area: c.area,
          state: c.state,
          notes: text(c.notes, 500, "coverage notes"),
          ...(c.supersedes === true ? { supersedes: true } : {}),
        };
      });
      const notes = (key) =>
        list(p[key] || [], 200, key).map((s) => text(s, 500, key));
      return {
        malId: p.malId,
        title: text(p.title, 300, "title"),
        scope: text(p.scope, 300, "adaptation scope"),
        status: p.status,
        analyzedAt: p.analyzedAt,
        analyzer: text(p.analyzer, 120, "analyzer version"),
        taxonomyVersion: RESEARCH_SCHEMA,
        metadataFingerprint: p.metadataFingerprint,
        sources,
        observations,
        dimensions,
        coverage,
        spoilersAllowed: p.spoilersAllowed === true,
        caveats: notes("caveats"),
        appeal: notes("appeal"),
        unknowns: notes("unknowns"),
      };
    },
  );
  if (!profiles.length) fail("There are no profiles to import.");
  return {
    format: "anime-shuffle-research",
    schemaVersion: RESEARCH_SCHEMA,
    profiles,
  };
}

export function createResearchStore(storage) {
  const { sql } = storage;
  const all = (q, ...args) => Array.from(sql.exec(q, ...args));
  const one = (q, ...args) => all(q, ...args)[0];
  sql.exec(
    "CREATE TABLE IF NOT EXISTS research_catalog (id INTEGER PRIMARY KEY, value TEXT NOT NULL, fingerprint TEXT NOT NULL, seen INTEGER NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS research_profiles (id INTEGER PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS research_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS research_audit (revision INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL, previous TEXT NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS model_catalog_profiles (id INTEGER PRIMARY KEY,fingerprint TEXT NOT NULL,version TEXT NOT NULL,value TEXT,checked INTEGER NOT NULL,evidence_hash TEXT NOT NULL,review_hash TEXT NOT NULL DEFAULT '')",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS model_catalog_state (key TEXT PRIMARY KEY,value TEXT NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS model_catalog_trait_progress (id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL, version TEXT NOT NULL, evidence_hash TEXT NOT NULL, cursor INTEGER NOT NULL, checked INTEGER NOT NULL, updated INTEGER NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS research_import_receipts (key TEXT PRIMARY KEY,digest TEXT NOT NULL,result TEXT NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS research_profile_origin (id INTEGER PRIMARY KEY, batch TEXT NOT NULL, label TEXT NOT NULL, at INTEGER NOT NULL, revision INTEGER NOT NULL)",
  );
  // Recover provenance for files imported before origin tracking existed.
  if (!one("SELECT value FROM research_meta WHERE key='origin-migration-v1'"))
    storage.transactionSync(() => {
      const origins = new Map();
      let beforeLast = new Map();
      for (const audit of all(
        "SELECT * FROM research_audit ORDER BY revision",
      )) {
        if (audit.kind === "import") {
          beforeLast = new Map(origins);
          const previous = JSON.parse(audit.previous);
          for (const p of previous) {
            const old = origins.get(p.id);
            p.origin = old
              ? {
                  batch: "legacy:" + old.revision,
                  label: "Import revision " + old.revision,
                  at: old.at,
                  revision: old.revision,
                }
              : null;
            origins.set(p.id, audit);
          }
          sql.exec(
            "UPDATE research_audit SET previous=? WHERE revision=?",
            JSON.stringify(previous),
            audit.revision,
          );
        } else if (audit.kind === "rollback") {
          origins.clear();
          for (const [id, value] of beforeLast) origins.set(id, value);
        }
      }
      for (const [id, a] of origins)
        if (one("SELECT id FROM research_profiles WHERE id=?", id))
          sql.exec(
            "INSERT OR REPLACE INTO research_profile_origin VALUES (?,?,?,?,?)",
            id,
            "legacy:" + a.revision,
            "Import revision " + a.revision,
            a.at,
            a.revision,
          );
      sql.exec("INSERT INTO research_meta VALUES ('origin-migration-v1','1')");
    });
  const origin = (id) =>
    one(
      "SELECT batch,label,at,revision FROM research_profile_origin WHERE id=?",
      id,
    ) || null;
  const revision = () =>
    Number(
      one("SELECT value FROM research_meta WHERE key='revision'")?.value || 0,
    );
  const get = (animeId) => {
    const row = one("SELECT value FROM research_profiles WHERE id=?", animeId);
    return row ? JSON.parse(row.value) : null;
  };
  const requirements = () => {
    const row = one("SELECT value FROM research_meta WHERE key='requirements'");
    return row ? JSON.parse(row.value) : [];
  };
  function saveRequirements(body, actor) {
    if (body.expectedDigest !== hash(requirements()))
      throw new AppError(
        "Research questions changed. Refresh before saving.",
        409,
      );
    const used = new Set();
    const clean = list(body.requirements, 50, "research questions").map((r) => {
      const key = text(r.key, 80, "question key");
      if (
        !/^[a-z][a-z0-9-]*$/.test(key) ||
        used.has(key) ||
        !RESEARCH_AREAS.includes(r.area)
      )
        fail("Invalid research question.");
      used.add(key);
      if (r.traitKey && !vocabulary.has(r.traitKey))
        fail("Unknown ranking trait.");
      if (r.dimensionKey && !/^[a-z][a-z0-9-]{0,79}$/.test(r.dimensionKey))
        fail("Invalid dimension key.");
      if (!r.traitKey && !r.dimensionKey)
        fail("Specify a ranking trait or reusable dimension to check.");
      return {
        key,
        label: text(r.label, 200, "research question"),
        area: r.area,
        traitKey: r.traitKey || null,
        dimensionKey: r.dimensionKey || null,
      };
    });
    storage.transactionSync(() => {
      sql.exec(
        "INSERT OR REPLACE INTO research_meta VALUES ('requirements',?)",
        JSON.stringify(clean),
      );
      sql.exec(
        "INSERT OR REPLACE INTO research_meta VALUES ('requirements-change',?)",
        JSON.stringify({ at: Date.now(), actor }),
      );
    });
    return { requirements: clean, digest: hash(clean) };
  }
  function auditCoverage({ after = 0, limit = 25 } = {}) {
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      fail("Invalid audit page.");
    const rows = all(
      "SELECT c.id,c.value,c.fingerprint,p.value manual,a.value automatic FROM research_catalog c LEFT JOIN research_profiles p ON c.id=p.id LEFT JOIN model_catalog_profiles a ON c.id=a.id WHERE c.id>? ORDER BY c.id LIMIT ?",
      after,
      limit + 1,
    );
    const requested = requirements();
    return {
      format: "anime-shuffle-research-audit",
      schemaVersion: 1,
      requirements: requested,
      instructions:
        "This audit checks explicit stored keys, not semantic completeness. Missing, unknown, low-confidence or changed evidence requires further research. Research questions do not themselves add ranking features.",
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      titles: rows.slice(0, limit).map((row) => {
        const profiles = [row.automatic, row.manual]
          .filter(Boolean)
          .map((v) => JSON.parse(v));
        const observations = new Map(
          profiles.flatMap((p) => p.observations || []).map((o) => [o.key, o]),
        );
        const dimensions = new Map(
          profiles.flatMap((p) => p.dimensions || []).map((d) => [d.key, d]),
        );
        const anime = JSON.parse(row.value);
        return {
          malId: row.id,
          title: anime.title,
          metadataFingerprint: row.fingerprint,
          profileCount: profiles.length,
          requirements: requested.map((r) => {
            const observation = r.traitKey
              ? observations.get(r.traitKey)
              : null;
            const dimension = r.dimensionKey
              ? dimensions.get(r.dimensionKey)
              : null;
            const states = [];
            if (r.traitKey)
              states.push(
                !observation
                  ? "missing"
                  : observation.score === null
                    ? "unknown"
                    : observation.confidence < 0.45
                      ? "partial"
                      : "supported",
              );
            if (r.dimensionKey)
              states.push(
                !dimension
                  ? "missing"
                  : dimension.area !== r.area || dimension.confidence < 0.45
                    ? "partial"
                    : "supported",
              );
            const changed = profiles.some(
              (p) =>
                p.metadataFingerprint &&
                p.metadataFingerprint !== row.fingerprint,
            );
            return {
              key: r.key,
              label: r.label,
              area: r.area,
              state: changed
                ? "changed"
                : states.includes("missing")
                  ? "missing"
                  : states.includes("unknown")
                    ? "unknown"
                    : states.includes("partial")
                      ? "partial"
                      : "supported",
              traitKey: r.traitKey,
              dimensionKey: r.dimensionKey,
            };
          }),
        };
      }),
    };
  }
  function remember(anime) {
    const a = publicAnime(anime);
    if (!a) return;
    const old = one(
      "SELECT value,fingerprint FROM research_catalog WHERE id=?",
      a.id,
    );
    // A thin ranking response must not erase a previously fetched synopsis.
    if (old) {
      const prior = JSON.parse(old.value);
      for (const key of ["synopsis", "status", "format", "englishTitle", "japaneseTitle"])
        if (!a[key]) a[key] = prior[key] || "";
      if (!a.year) a.year = prior.year || null;
      if (!a.duration) a.duration = prior.duration || null;
      if (!a.synonyms.length) a.synonyms = prior.synonyms || [];
      if (!a.studios.length) a.studios = prior.studios || [];
      if (!a.episodes) a.episodes = prior.episodes || 0;
      if (!a.genres.length) a.genres = prior.genres || [];
    }
    const fingerprint = animeFingerprint(a);
    if (old?.fingerprint === fingerprint && old.value === JSON.stringify(a)) return;
    sql.exec(
      "INSERT OR REPLACE INTO research_catalog VALUES (?,?,?,?)",
      a.id,
      JSON.stringify(a),
      fingerprint,
      Date.now(),
    );
  }
  function projection(animeId) {
    const p = get(animeId);
    const row = one(
      "SELECT value FROM model_catalog_profiles WHERE id=?",
      animeId,
    );
    const auto = row?.value ? JSON.parse(row.value) : null;
    if (!p && !auto) return null;
    // Explicit owner research wins when both assess the same trait. Automated
    // work never overwrites an imported profile or affects its rollback history.
    const combined = new Map((auto?.observations || []).map((o) => [o.key, o]));
    for (const o of p?.observations || [])
      if (o.score !== null || !combined.has(o.key)) combined.set(o.key, o);
    return {
      version: RESEARCH_SCHEMA,
      observations: [...combined.values()]
        .filter((o) => {
          const term = vocabulary.get(o.key);
          return (
            term &&
            o.containsSpoilers !== true &&
            term.explanationSafe !== false &&
            term.matchingEnabled !== false
          );
        })
        .map(({ key, score, confidence, prominence }) => ({
          key,
          score,
          confidence,
          prominence,
        })),
    };
  }
  function stale(p) {
    const row = one(
      "SELECT fingerprint FROM research_catalog WHERE id=?",
      p.malId,
    );
    return !!(
      p.metadataFingerprint &&
      row &&
      p.metadataFingerprint !== row.fingerprint
    );
  }
  function preview(bundle) {
    const clean = validateResearchBundle(bundle);
    const merged = clean.profiles.map((p) =>
      mergeResearchProfile(get(p.malId), p),
    );
    // Validate the final union too: never silently truncate accumulated evidence.
    const mergedBundle = validateResearchBundle({
      ...clean,
      profiles: merged.map((m) => m.profile),
    });
    return {
      bundle: clean,
      mergedBundle,
      mergeChanges: merged.reduce((sum, entry) => {
        for (const [key, value] of Object.entries(entry.changes))
          sum[key] = (sum[key] || 0) + value;
        return sum;
      }, {}),
      digest: hash(clean),
      revision: revision(),
      count: clean.profiles.length,
      newProfiles: clean.profiles.filter((p) => !get(p.malId)).length,
      replacements: clean.profiles.filter((p) => get(p.malId)).length,
      staleInputs: clean.profiles.filter(stale).map((p) => p.malId),
      titles: mergedBundle.profiles.map((p) => {
        const catalog = one(
          "SELECT value FROM research_catalog WHERE id=?",
          p.malId,
        );
        return {
          id: p.malId,
          title: p.title,
          traits: p.observations.filter((o) => o.score !== null).length,
          status: p.status,
          incrementalImpact: researchImpact(
            catalog ? JSON.parse(catalog.value) : null,
            p,
            projection(p.malId),
          ),
        };
      }),
    };
  }
  function commit(
    bundle,
    expectedRevision,
    expectedDigest,
    actor = "admin",
    importKey = null,
    importLabel = null,
  ) {
    if (importLabel !== null)
      importLabel = text(importLabel, 200, "import filename");
    if (importKey !== null && !/^[a-zA-Z0-9:-]{1,120}$/.test(importKey))
      fail("Invalid import receipt key.");
    if (importKey) {
      const saved = one(
        "SELECT digest,result FROM research_import_receipts WHERE key=?",
        importKey,
      );
      if (saved) {
        const clean = validateResearchBundle(bundle);
        if (saved.digest !== hash(clean))
          throw new AppError(
            "An import key was reused for different profiles.",
            409,
          );
        const receipt = JSON.parse(saved.result);
        if (
          clean.profiles.some(
            (p) =>
              hash(get(p.malId)) !==
              (receipt.profileHashes?.[p.malId] || hash(p)),
          )
        )
          throw new AppError(
            "This import was subsequently changed or undone. Preview again with a new import key.",
            409,
          );
        return {
          ...JSON.parse(saved.result),
          replayed: true,
        };
      }
    }
    const checked = preview(bundle);
    if (
      checked.revision !== expectedRevision ||
      checked.digest !== expectedDigest
    )
      throw new AppError(
        "The profiles changed since preview. Validate the file again.",
        409,
      );
    if (checked.staleInputs.length)
      throw new AppError(
        "Catalog evidence changed for these titles. Export fresh inputs before importing: " +
          checked.staleInputs.join(", "),
        409,
      );
    return storage.transactionSync(() => {
      if (revision() !== expectedRevision)
        throw new AppError("Another import completed. Validate again.", 409);
      const next = revision() + 1,
        previous = checked.bundle.profiles.map((p) => ({
          id: p.malId,
          value: get(p.malId),
          origin: origin(p.malId),
        }));
      for (const p of checked.mergedBundle.profiles) {
        sql.exec(
          "INSERT OR REPLACE INTO research_profiles VALUES (?,?,?)",
          p.malId,
          JSON.stringify(p),
          Date.now(),
        );
        sql.exec(
          "INSERT OR REPLACE INTO research_profile_origin VALUES (?,?,?,?,?)",
          p.malId,
          importKey ? importKey.replace(/:\d+$/, "") : "revision:" + next,
          importLabel || "Import revision " + next,
          Date.now(),
          next,
        );
      }
      sql.exec(
        "INSERT INTO research_audit VALUES (?,?,?,?,?,?)",
        next,
        Date.now(),
        actor,
        "import",
        previous.length,
        JSON.stringify(previous),
      );
      sql.exec(
        "INSERT OR REPLACE INTO research_meta VALUES ('revision',?)",
        String(next),
      );
      const result = {
        revision: next,
        imported: previous.length,
        mergeChanges: checked.mergeChanges,
        profileHashes: Object.fromEntries(
          checked.mergedBundle.profiles.map((p) => [p.malId, hash(p)]),
        ),
      };
      if (importKey)
        sql.exec(
          "INSERT INTO research_import_receipts VALUES (?,?,?)",
          importKey,
          checked.digest,
          JSON.stringify(result),
        );
      return result;
    });
  }
  function rollback(expectedRevision, actor) {
    return storage.transactionSync(() => {
      const last = one(
        "SELECT * FROM research_audit ORDER BY revision DESC LIMIT 1",
      );
      if (!last || last.revision !== expectedRevision || last.kind !== "import")
        throw new AppError(
          "Only the latest import can be undone. Refresh the dashboard.",
          409,
        );
      const previous = JSON.parse(last.previous),
        next = revision() + 1;
      for (const p of previous) {
        if (p.origin)
          sql.exec(
            "INSERT OR REPLACE INTO research_profile_origin VALUES (?,?,?,?,?)",
            p.id,
            p.origin.batch,
            p.origin.label,
            p.origin.at,
            p.origin.revision,
          );
        else sql.exec("DELETE FROM research_profile_origin WHERE id=?", p.id);
        if (p.value)
          sql.exec(
            "INSERT OR REPLACE INTO research_profiles VALUES (?,?,?)",
            p.id,
            JSON.stringify(p.value),
            Date.now(),
          );
        else sql.exec("DELETE FROM research_profiles WHERE id=?", p.id);
      }
      sql.exec(
        "INSERT INTO research_audit VALUES (?,?,?,?,?,?)",
        next,
        Date.now(),
        actor,
        "rollback",
        previous.length,
        "[]",
      );
      sql.exec(
        "INSERT OR REPLACE INTO research_meta VALUES ('revision',?)",
        String(next),
      );
      return { revision: next, restored: previous.length };
    });
  }
  function traitAssessmentProgress(id) {
    const row = one(
      "SELECT * FROM model_catalog_trait_progress WHERE id=?",
      id,
    );
    const catalog = one(
      "SELECT fingerprint FROM research_catalog WHERE id=?",
      id,
    );
    const activeVersion = one(
      "SELECT value FROM model_catalog_state WHERE key=?",
      "activeAnalysisVersion",
    );
    const current =
      !!row &&
      (!activeVersion || JSON.parse(activeVersion.value) === row.version) &&
      row.fingerprint === catalog?.fingerprint &&
      row.version.includes(`:${TRAIT_CATALOG_VERSION}:`) &&
      row.version.endsWith(`:${hash(requirements())}`);
    const checked = current ? row.checked : 0;
    return {
      taxonomyVersion: TRAIT_CATALOG_VERSION,
      total: researchVocabulary.length,
      detailedTotal: researchVocabulary.filter((t) => t.familyKey).length,
      checked,
      remaining: researchVocabulary.length - checked,
      // Ordered keys are provided by vocabulary, not duplicated per anime.
      checkedThrough: current ? row.cursor : 0,
      complete:
        current &&
        row.cursor === researchVocabulary.length &&
        checked === researchVocabulary.length,
      stale: !!row && !current,
      updatedAt: row ? new Date(row.updated).toISOString() : null,
      meaning:
        "Checked against the available evidence; does not establish presence, absence, or exhaustive external research.",
    };
  }
  function exportBatch({
    kind = "pending",
    after = 0,
    limit = 25,
    query = "",
    batch = "",
  } = {}) {
    if (
      typeof query !== "string" ||
      query.length > 200 ||
      typeof batch !== "string" ||
      batch.length > 120
    )
      fail("Invalid profile filter.");
    if (
      !["pending", "catalog", "profiles", "automatic"].includes(kind) ||
      !Number.isSafeInteger(after) ||
      after < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      fail("Invalid export page.");
    const rows =
      kind === "automatic"
        ? all(
            "SELECT id,value FROM model_catalog_profiles WHERE id>? AND value IS NOT NULL ORDER BY id LIMIT ?",
            after,
            limit + 1,
          )
        : kind === "profiles"
          ? all(
              "SELECT p.id,p.value FROM research_profiles p LEFT JOIN research_profile_origin o ON p.id=o.id WHERE p.id>? AND (?='' OR instr(lower(json_extract(p.value,'$.title')),lower(?))>0 OR CAST(p.id AS TEXT)=?) AND (?='' OR o.batch=?) ORDER BY p.id LIMIT ?",
              after,
              query,
              query,
              query,
              batch,
              batch,
              limit + 1,
            )
          : all(
              `SELECT c.id,c.value,c.fingerprint FROM research_catalog c LEFT JOIN research_profiles p ON c.id=p.id WHERE c.id>? ${kind === "pending" ? "AND (p.id IS NULL OR json_extract(p.value,'$.status')='preliminary' OR COALESCE(json_array_length(p.value,'$.coverage'),0)<12 OR COALESCE(json_array_length(p.value,'$.dimensions'),0)=0 OR EXISTS(SELECT 1 FROM json_each(p.value,'$.coverage') WHERE json_extract(value,'$.state') NOT IN ('supported','not-applicable')) OR (json_extract(p.value,'$.metadataFingerprint') IS NOT NULL AND json_extract(p.value,'$.metadataFingerprint') != c.fingerprint))" : ""} ORDER BY c.id LIMIT ?`,
              after,
              limit + 1,
            );
    const page = rows.slice(0, limit);
    return {
      format: "anime-shuffle-research",
      schemaVersion: RESEARCH_SCHEMA,
      exportedAt: new Date().toISOString(),
      revision: revision(),
      nextCursor: rows.length > limit ? page.at(-1).id : null,
      assessmentProgress: Object.fromEntries(
        page.map((r) => [r.id, traitAssessmentProgress(r.id)]),
      ),
      assessmentPlan: {
        scope: "full-catalog",
        detailedTraits: 3000,
        originalTraits: 188,
        totalTraits: researchVocabulary.length,
        unsupported: "unknown",
        completionRequires:
          "Every key checked against evidence; supported observations remain sparse.",
      },
      origins:
        kind === "profiles"
          ? Object.fromEntries(page.map((r) => [r.id, origin(r.id)]))
          : {},
      impacts:
        kind === "profiles"
          ? Object.fromEntries(
              page.map((r) => {
                const metadata = one(
                  "SELECT value FROM research_catalog WHERE id=?",
                  r.id,
                );
                const auto = one(
                  "SELECT value FROM model_catalog_profiles WHERE id=?",
                  r.id,
                );
                return [
                  r.id,
                  researchImpact(
                    metadata ? JSON.parse(metadata.value) : null,
                    JSON.parse(r.value),
                    auto?.value
                      ? { ...JSON.parse(auto.value), version: 1 }
                      : null,
                  ),
                ];
              }),
            )
          : {},
      profiles: ["profiles", "automatic"].includes(kind)
        ? page.map((r) => JSON.parse(r.value))
        : [],
      catalog: ["profiles", "automatic"].includes(kind)
        ? []
        : page.map((r) => ({
            ...JSON.parse(r.value),
            metadataFingerprint: r.fingerprint,
            existingProfile: get(r.id),
            existingAutomaticProfile: (() => {
              const saved = one(
                "SELECT value FROM model_catalog_profiles WHERE id=?",
                r.id,
              );
              return saved?.value ? JSON.parse(saved.value) : null;
            })(),
          })),
      vocabulary: researchVocabulary,
      traitFamilies: TRAIT_FAMILIES,
      taxonomyVersion: TRAIT_CATALOG_VERSION,
      instructions: ANALYSIS_GUIDE,
      researchQuestions: RESEARCH_QUESTIONS,
      mergePolicy:
        "Merge by exact MAL ID; preserve omitted/unknown findings. Explicit sourced corrections use observation.supersedes=true. Dimensions are reusable research and do not automatically become ranking features.",
      requirements: requirements(),
      researchAreas: RESEARCH_AREAS,
    };
  }
  function stats() {
    return {
      revision: revision(),
      batches: all(
        "SELECT o.batch,o.label,MAX(o.at) at,COUNT(*) count,SUM(CASE WHEN json_extract(p.value,'$.status')='preliminary' THEN 1 ELSE 0 END) preliminary,SUM(CASE WHEN EXISTS(SELECT 1 FROM json_each(p.value,'$.observations') WHERE json_extract(value,'$.score') IS NOT NULL) THEN 1 ELSE 0 END) assessed FROM research_profile_origin o JOIN research_profiles p ON p.id=o.id GROUP BY o.batch,o.label ORDER BY at DESC",
      ),
      catalog: one("SELECT COUNT(*) n FROM research_catalog").n,
      profiles: one("SELECT COUNT(*) n FROM research_profiles").n,
      preliminary: one(
        "SELECT COUNT(*) n FROM research_profiles WHERE json_extract(value,'$.status')='preliminary'",
      ).n,
      stale: one(
        "SELECT COUNT(*) n FROM research_profiles p JOIN research_catalog c ON p.id=c.id WHERE json_extract(p.value,'$.metadataFingerprint') IS NOT NULL AND json_extract(p.value,'$.metadataFingerprint') != c.fingerprint",
      ).n,
      pending: one(
        "SELECT COUNT(*) n FROM research_catalog c LEFT JOIN research_profiles p ON c.id=p.id WHERE p.id IS NULL",
      ).n,
      history: all(
        "SELECT revision,at,kind,count FROM research_audit ORDER BY revision DESC LIMIT 10",
      ),
    };
  }
  function installSeed(bundle, key) {
    if (one("SELECT value FROM research_meta WHERE key=?", "seed:" + key))
      return;
    const clean = validateResearchBundle(bundle);
    storage.transactionSync(() => {
      for (const p of clean.profiles)
        if (!get(p.malId))
          sql.exec(
            "INSERT INTO research_profiles VALUES (?,?,?)",
            p.malId,
            JSON.stringify(p),
            Date.now(),
          );
      sql.exec(
        "INSERT INTO research_meta VALUES (?,?)",
        "seed:" + key,
        String(Date.now()),
      );
    });
  }
  return {
    remember,
    get,
    projection,
    preview,
    commit,
    rollback,
    exportBatch,
    stats,
    installSeed,
    requirements,
    saveRequirements,
    auditCoverage,
    attach(anime) {
      remember(anime);
      const p = projection(anime.id);
      return p ? { ...anime, researchTaste: p } : anime;
    },
  };
}

/** Shared route implementation; callers authenticate, authorize and verify CSRF
 * before entering. Exporting never reads private reactions, lists or credentials. */
export function researchAdminRoute(
  store,
  url,
  method,
  body,
  actor,
  diagnostics,
) {
  const route = url.pathname;
  if (route === "/api/admin/status" && method === "GET")
    return {
      ...store.stats(),
      enrichment: diagnostics,
      vocabulary: researchVocabulary,
      traitFamilies: TRAIT_FAMILIES,
      taxonomyVersion: TRAIT_CATALOG_VERSION,
      instructions: ANALYSIS_GUIDE,
      researchAreas: RESEARCH_AREAS,
      requirements: store.requirements(),
      requirementsDigest: hash(store.requirements()),
    };
  if (route === "/api/admin/research/requirements" && method === "POST")
    return store.saveRequirements(body, actor);
  if (route === "/api/admin/research/audit" && method === "GET")
    return store.auditCoverage({
      after: Number(url.searchParams.get("after") || 0),
      limit: Number(url.searchParams.get("limit") || 25),
    });
  if (route === "/api/admin/export" && method === "GET")
    return store.exportBatch({
      kind: url.searchParams.get("kind") || "pending",
      after: Number(url.searchParams.get("after") || 0),
      limit: Number(url.searchParams.get("limit") || 25),
      query: url.searchParams.get("query") || "",
      batch: url.searchParams.get("batch") || "",
    });
  if (route === "/api/admin/validate" && method === "POST") {
    const { bundle, mergedBundle, ...report } = store.preview(body.bundle);
    return report;
  }
  if (route === "/api/admin/import" && method === "POST")
    return store.commit(
      body.bundle,
      body.revision,
      body.digest,
      actor,
      body.importKey || null,
      body.importLabel || null,
    );
  if (route === "/api/admin/rollback" && method === "POST")
    return store.rollback(body.revision, actor);
  throw new AppError("Admin endpoint not found.", 404);
}
