import { createHash } from "node:crypto";
import { AppError } from "./mal.mjs";
import { NUANCES } from "../src/lib/nuanced-taste.js";
import {
  RESEARCH_TRAITS,
  ANALYSIS_GUIDE,
} from "../src/lib/research-taxonomy.js";

export const RESEARCH_SCHEMA = 1;
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
  const profiles = list(bundle.profiles, 100, "profiles").map((p) => {
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
    const sources = list(p.sources, 20, "sources").map((s) => {
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
      const refs = [...new Set(list(o.sources, 20, "trait sources"))];
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
        refs.map((ref) =>
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
      };
    });
    if (!observations.length)
      fail("A profile needs at least one assessed or unknown trait.");
    const notes = (key) =>
      list(p[key] || [], 20, key).map((s) => text(s, 500, key));
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
      caveats: notes("caveats"),
      appeal: notes("appeal"),
      unknowns: notes("unknowns"),
    };
  });
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
  const revision = () =>
    Number(
      one("SELECT value FROM research_meta WHERE key='revision'")?.value || 0,
    );
  const get = (animeId) => {
    const row = one("SELECT value FROM research_profiles WHERE id=?", animeId);
    return row ? JSON.parse(row.value) : null;
  };
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
      for (const key of ["synopsis", "status", "format", "englishTitle"])
        if (!a[key]) a[key] = prior[key] || "";
      if (!a.episodes) a.episodes = prior.episodes || 0;
      if (!a.genres.length) a.genres = prior.genres || [];
    }
    const fingerprint = animeFingerprint(a);
    if (old?.fingerprint === fingerprint) return;
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
    for (const o of p?.observations || []) combined.set(o.key, o);
    return {
      version: RESEARCH_SCHEMA,
      observations: [...combined.values()].map(
        ({ key, score, confidence, prominence }) => ({
          key,
          score,
          confidence,
          prominence,
        }),
      ),
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
    return {
      bundle: clean,
      digest: hash(clean),
      revision: revision(),
      count: clean.profiles.length,
      newProfiles: clean.profiles.filter((p) => !get(p.malId)).length,
      replacements: clean.profiles.filter((p) => get(p.malId)).length,
      staleInputs: clean.profiles.filter(stale).map((p) => p.malId),
      titles: clean.profiles.map((p) => ({
        id: p.malId,
        title: p.title,
        traits: p.observations.filter((o) => o.score !== null).length,
        status: p.status,
      })),
    };
  }
  function commit(bundle, expectedRevision, expectedDigest, actor = "admin") {
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
        }));
      for (const p of checked.bundle.profiles)
        sql.exec(
          "INSERT OR REPLACE INTO research_profiles VALUES (?,?,?)",
          p.malId,
          JSON.stringify(p),
          Date.now(),
        );
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
      return { revision: next, imported: previous.length };
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
  function exportBatch({ kind = "pending", after = 0, limit = 25 } = {}) {
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
              "SELECT id,value FROM research_profiles WHERE id>? ORDER BY id LIMIT ?",
              after,
              limit + 1,
            )
          : all(
              `SELECT c.id,c.value,c.fingerprint FROM research_catalog c LEFT JOIN research_profiles p ON c.id=p.id WHERE c.id>? ${kind === "pending" ? "AND (p.id IS NULL OR (json_extract(p.value,'$.metadataFingerprint') IS NOT NULL AND json_extract(p.value,'$.metadataFingerprint') != c.fingerprint))" : ""} ORDER BY c.id LIMIT ?`,
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
      profiles: ["profiles", "automatic"].includes(kind)
        ? page.map((r) => JSON.parse(r.value))
        : [],
      catalog: ["profiles", "automatic"].includes(kind)
        ? []
        : page.map((r) => ({
            ...JSON.parse(r.value),
            metadataFingerprint: r.fingerprint,
            existingProfile: get(r.id),
          })),
      vocabulary: researchVocabulary,
      instructions: ANALYSIS_GUIDE,
    };
  }
  function stats() {
    return {
      revision: revision(),
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
      instructions: ANALYSIS_GUIDE,
    };
  if (route === "/api/admin/export" && method === "GET")
    return store.exportBatch({
      kind: url.searchParams.get("kind") || "pending",
      after: Number(url.searchParams.get("after") || 0),
      limit: Number(url.searchParams.get("limit") || 25),
    });
  if (route === "/api/admin/validate" && method === "POST") {
    const { bundle, ...report } = store.preview(body.bundle);
    return report;
  }
  if (route === "/api/admin/import" && method === "POST")
    return store.commit(body.bundle, body.revision, body.digest, actor);
  if (route === "/api/admin/rollback" && method === "POST")
    return store.rollback(body.revision, actor);
  throw new AppError("Admin endpoint not found.", 404);
}
