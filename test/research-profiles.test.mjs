import test from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  createResearchStore,
  validateResearchBundle,
  animeFingerprint,
  isResearchAdmin,
} from "../lib/research-profiles.mjs";
import { createCloudApp } from "../cloudflare/app.mjs";
import { RESEARCH_SEED } from "../data/research-seed.mjs";
import { nuancedTraits } from "../src/lib/nuanced-taste.js";
import { buildTaste, scoreAnime } from "../src/lib/recommend.js";

function storage() {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    sql: {
      exec(q, ...args) {
        const s = db.prepare(q);
        if (s.columns().length) return s.all(...args);
        s.run(...args);
        return [];
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
const bundle = () => ({
  ...structuredClone(RESEARCH_SEED),
  profiles: [structuredClone(RESEARCH_SEED.profiles[0])],
});
const anime = {
  id: 16498,
  title: "Shingeki no Kyojin",
  synopsis: "A public premise.",
  episodes: 25,
  status: "finished_airing",
  genres: ["Action"],
  format: "tv",
};
test("batch origins survive restart, group chunks, support catalog-wide lookup, and restore on rollback", () => {
  const db = storage();
  let s = createResearchStore(db);
  const b = bundle();
  b.profiles[0].metadataFingerprint = null;
  let p = s.preview(b);
  s.commit(b, p.revision, p.digest, "test", "first:0", "batch-one.json");
  const next = bundle();
  next.profiles[0].malId = 99999;
  next.profiles[0].title = "Beyond first page";
  next.profiles[0].metadataFingerprint = null;
  next.profiles[0].observations.forEach((o) => (o.score = null));
  p = s.preview(next);
  s.commit(next, p.revision, p.digest, "test", "first:1", "batch-one.json");
  s = createResearchStore(db);
  assert.equal(s.stats().batches[0].count, 2);
  assert.equal(s.stats().batches[0].assessed, 1);
  const page = s.exportBatch({ kind: "profiles", limit: 1 });
  assert.notEqual(page.nextCursor, null);
  const found = s.exportBatch({
    kind: "profiles",
    query: "99999",
    batch: "first",
  });
  assert.equal(found.profiles[0].title, "Beyond first page");
  assert.equal(found.origins[99999].label, "batch-one.json");
  assert.equal(
    s.exportBatch({ kind: "profiles", query: "' OR 1=1 --" }).profiles.length,
    0,
  );
  p = s.preview(b);
  const updated = s.commit(
    b,
    p.revision,
    p.digest,
    "test",
    "second:0",
    "batch-two.json",
  );
  assert.equal(
    s.exportBatch({ kind: "profiles", batch: "second" }).profiles.length,
    1,
  );
  s.rollback(updated.revision, "test");
  assert.equal(
    s.exportBatch({ kind: "profiles", batch: "second" }).profiles.length,
    0,
  );
  assert.equal(s.stats().batches[0].count, 2);
  db.db.close();
});
test("existing imports gain visible provenance without reimport, with correct rollback lineage", () => {
  const db = storage();
  let s = createResearchStore(db);
  const b = bundle();
  b.profiles[0].metadataFingerprint = null;
  for (let i = 0; i < 2; i++) {
    b.profiles[0].title = "Version " + i;
    const p = s.preview(b);
    s.commit(b, p.revision, p.digest, "test");
  }
  db.sql.exec("DELETE FROM research_meta WHERE key='origin-migration-v1'");
  db.sql.exec("DELETE FROM research_profile_origin");
  for (const a of db.sql.exec("SELECT revision,previous FROM research_audit")) {
    const previous = JSON.parse(a.previous).map(({ origin, ...p }) => p);
    db.sql.exec(
      "UPDATE research_audit SET previous=? WHERE revision=?",
      JSON.stringify(previous),
      a.revision,
    );
  }
  s = createResearchStore(db);
  assert.equal(s.stats().batches[0].label, "Import revision 2");
  s.rollback(2, "test");
  assert.equal(s.stats().batches[0].label, "Import revision 1");
  assert.equal(s.get(b.profiles[0].malId).title, "Version 0");
  db.db.close();
});
test("research imports reject malformed files and unsupported qualities; unknown remains unknown", () => {
  for (const b of [
    {},
    { format: "anime-shuffle-watchlist", schemaVersion: 1, profiles: [] },
    { ...bundle(), schemaVersion: 99 },
  ])
    assert.throws(() => validateResearchBundle(b));
  const b = bundle();
  b.profiles.push(b.profiles[0]);
  assert.throws(() => validateResearchBundle(b), /unique/);
  for (const change of [
    (o) => (o.score = 5),
    (o) => (o.key = "invented"),
    (o) => (o.sources = ["missing"]),
    (o) => (o.confidence = NaN),
  ]) {
    const b = bundle();
    change(b.profiles[0].observations[0]);
    assert.throws(() => validateResearchBundle(b));
  }
  const quality = bundle();
  quality.profiles[0].observations[0].key = "animation-execution";
  assert.throws(() => validateResearchBundle(quality), /synopsis/);
  const unsafe = bundle();
  unsafe.profiles[0].sources[0].url = "javascript:alert(1)";
  assert.throws(() => validateResearchBundle(unsafe));
  const unknown = bundle();
  unknown.profiles[0].observations[0].score = null;
  assert.equal(
    validateResearchBundle(unknown).profiles[0].observations[0].score,
    null,
  );
  assert.equal(validateResearchBundle(RESEARCH_SEED).profiles.length, 25);
});
test("preview is read-only; import is durable, strips secrets, detects conflicts, and rollback restores previous values", () => {
  const db = storage();
  let s = createResearchStore(db);
  s.remember({
    ...anime,
    listStatus: { score: 10 },
    tokens: "PRIVATE",
    username: "PRIVATE",
  });
  const b = bundle();
  b.profiles[0].metadataFingerprint = animeFingerprint(anime);
  b.profiles[0].admin = true;
  const p = s.preview(b);
  assert.equal(s.stats().profiles, 0);
  assert.equal(s.commit(b, p.revision, p.digest, "test-owner").imported, 1);
  s = createResearchStore(db);
  assert.equal(s.stats().profiles, 1);
  assert.equal(s.get(anime.id).admin, undefined);
  assert.throws(
    () => s.commit(b, p.revision, p.digest, "test-owner"),
    /changed/,
  );
  const update = bundle();
  update.profiles[0].metadataFingerprint = animeFingerprint(anime);
  update.profiles[0].title = "Updated";
  const next = s.preview(update);
  s.commit(update, next.revision, next.digest, "test-owner");
  assert.equal(s.get(anime.id).title, "Updated");
  s.rollback(2, "test-owner");
  assert.equal(s.get(anime.id).title, anime.title);
  assert.throws(() => s.rollback(3, "test-owner"), /latest import/);
  const exported = JSON.stringify(s.exportBatch({ kind: "catalog" }));
  assert.ok(!exported.includes("PRIVATE"));
  assert.ok(!exported.includes("listStatus"));
  const projection = JSON.stringify(s.projection(anime.id));
  assert.ok(!projection.includes("evidence"));
  assert.ok(!projection.includes("sources"));
  db.db.close();
});
test("changed input cannot silently overwrite a profile; thin catalog responses retain the synopsis", () => {
  const db = storage(),
    s = createResearchStore(db);
  s.remember(anime);
  s.remember({ ...anime, synopsis: "" });
  assert.equal(
    s.exportBatch({ kind: "catalog" }).catalog[0].synopsis,
    anime.synopsis,
  );
  const b = bundle();
  b.profiles[0].metadataFingerprint = animeFingerprint(anime);
  let p = s.preview(b);
  s.commit(b, p.revision, p.digest, "test");
  s.remember({ ...anime, status: "currently_airing" });
  p = s.preview(b);
  assert.equal(s.stats().stale, 1);
  assert.deepEqual(p.staleInputs, [anime.id]);
  assert.throws(
    () => s.commit(b, p.revision, p.digest, "test"),
    /evidence changed/,
  );
  assert.equal(s.exportBatch().catalog.length, 1);
  db.db.close();
});
test("research export pagination covers the catalog and imported profiles survive seed reinstall", () => {
  const db = storage(),
    s = createResearchStore(db);
  for (let i = 1; i <= 61; i++) s.remember({ ...anime, id: i });
  let after = 0,
    ids = [];
  do {
    const p = s.exportBatch({ kind: "catalog", after });
    ids.push(...p.catalog.map((a) => a.id));
    after = p.nextCursor;
  } while (after !== null);
  assert.equal(new Set(ids).size, 61);
  s.installSeed(RESEARCH_SEED, "pilot");
  assert.equal(s.stats().profiles, 25);
  const b = bundle();
  b.profiles[0].title = "Owner revision";
  b.profiles[0].metadataFingerprint = null;
  const p = s.preview(b);
  s.commit(b, p.revision, p.digest, "test");
  s.installSeed(RESEARCH_SEED, "pilot");
  assert.equal(s.get(anime.id).title, "Owner revision");
  db.db.close();
});
test("researched evidence participates in nuanced ranking but arbitrary prose never becomes an explanation", () => {
  const db = storage(),
    s = createResearchStore(db);
  s.installSeed(RESEARCH_SEED, "pilot");
  const enriched = s.attach({ ...anime, genres: [], synopsis: "" });
  const traits = nuancedTraits(enriched);
  assert.ok(traits.has("survival-pressure"));
  assert.equal(traits.get("survival-pressure").source, "research");
  assert.ok(
    ![...traits.values()].some((v) => v.description.includes("<script")),
  );
  const unknown = {
    ...enriched,
    researchTaste: {
      version: 1,
      observations: [
        {
          key: "survival-pressure",
          score: null,
          confidence: 1,
          prominence: "central",
        },
      ],
    },
  };
  assert.equal(nuancedTraits(unknown).size, 0);
  // These scores use the real trained model: shared research features alter ranks.
  const reaction = { anime: enriched, action: "good", at: 1 };
  const taste = buildTaste({ [anime.id]: reaction }, []);
  const match = { ...enriched, id: 99901 },
    other = { ...enriched, id: 99902, researchTaste: null };
  assert.ok(scoreAnime(match, taste) > scoreAnime(other, taste));
  db.db.close();
});
test("admin permissions are denied by default and checked on every server route, with CSRF and revocation", async () => {
  assert.equal(isResearchAdmin({ id: "local:x" }, ""), false);
  assert.equal(
    isResearchAdmin({ id: "local:x", admin: true }, "local:y"),
    false,
  );
  const db = storage(),
    env = {
      PUBLIC_ORIGIN: "https://shuffle.example",
      TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
      REVIEW_ENRICHMENT: "false",
    };
  let app = createCloudApp(db, env),
    cookie = "",
    csrf = "";
  async function req(path, data, headers = {}) {
    const r = await app.fetch(
      new Request(env.PUBLIC_ORIGIN + path, {
        method: data ? "POST" : "GET",
        headers: {
          cookie,
          ...(data
            ? {
                origin: env.PUBLIC_ORIGIN,
                "content-type": "application/json",
                "x-csrf-token": csrf,
              }
            : {}),
          ...headers,
        },
        body: data ? JSON.stringify(data) : undefined,
      }),
    );
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const body = await r.json();
    if (body.csrf) csrf = body.csrf;
    return { status: r.status, body };
  }
  await req("/api/session");
  assert.equal((await req("/api/admin/export")).status, 401);
  const registered = await req("/api/account/register", {
    username: "OwnerTest",
    password: "secure test password",
  });
  assert.equal((await req("/api/admin/status")).status, 403);
  assert.equal(
    (await req("/api/admin/import", { bundle: bundle(), admin: true })).status,
    403,
  );
  env.ADMIN_ACCOUNT_IDS = registered.body.account.id;
  app = createCloudApp(db, env);
  assert.equal((await req("/api/session")).body.admin, true);
  assert.equal((await req("/api/admin/status")).status, 200);
  assert.equal(
    (
      await req(
        "/api/admin/validate",
        { bundle: bundle() },
        { "x-csrf-token": "wrong" },
      )
    ).status,
    403,
  );
  const b = bundle();
  b.profiles[0].title = "Owner update";
  const preview = await req("/api/admin/validate", { bundle: b });
  assert.equal(preview.status, 200);
  assert.equal(
    (
      await req("/api/admin/import", {
        bundle: b,
        digest: preview.body.digest,
        revision: preview.body.revision,
      })
    ).status,
    200,
  );
  const exported = await req("/api/admin/export?kind=profiles");
  assert.equal(exported.status, 200);
  assert.ok(!JSON.stringify(exported.body).includes("password_hash"));
  const publicTaste = await req("/api/taste?ids=16498");
  assert.ok(publicTaste.body.research[16498]);
  assert.ok(!JSON.stringify(publicTaste.body.research).includes("evidence"));
  env.ADMIN_ACCOUNT_IDS = "";
  app = createCloudApp(db, env);
  assert.equal((await req("/api/admin/export")).status, 403);
  db.db.close();
});

test("extensible research dimensions retain source context without becoming ranking or public prose", () => {
  const b = bundle(),
    p = b.profiles[0];
  p.dimensions = [
    {
      key: "military-recruitment",
      area: "characters",
      description:
        "The leads enter military service as inexperienced recruits.",
      basis: "premise",
      confidence: 0.8,
      sources: [p.sources[0].id],
    },
  ];
  p.coverage = [
    {
      area: "characters",
      state: "partial",
      notes:
        "Opening premise only; later character development requires reviews.",
    },
  ];
  const clean = validateResearchBundle(b);
  assert.equal(
    clean.profiles[0].dimensions[0].description,
    p.dimensions[0].description,
  );
  const s = storage(),
    store = createResearchStore(s),
    preview = store.preview(b);
  store.commit(b, preview.revision, preview.digest, "test");
  assert.equal(
    store.exportBatch({ kind: "profiles" }).profiles[0].dimensions.length,
    1,
  );
  assert.ok(
    !JSON.stringify(store.projection(p.malId)).includes("military-recruitment"),
  );
  p.dimensions[0].area = "presentation";
  assert.throws(() => validateResearchBundle(b), /synopsis/);
  p.dimensions[0].area = "characters";
  p.dimensions[0].sources = ["missing"];
  assert.throws(() => validateResearchBundle(b), /source/);
  s.db.close();
});

test("research questions persist in exports and coverage audits identify explicit missing and stale evidence", () => {
  const s = storage(),
    store = createResearchStore(s);
  store.remember(anime);
  const b = bundle(),
    p = b.profiles[0];
  p.metadataFingerprint = animeFingerprint(anime);
  p.dimensions = [
    {
      key: "character-agency",
      area: "characters",
      description: "SPOILER_PRIVATE_CHARACTER_OUTCOME",
      basis: "premise",
      confidence: 0.8,
      sources: [p.sources[0].id],
      containsSpoilers: true,
    },
  ];
  const preview = store.preview(b);
  store.commit(b, preview.revision, preview.digest, "owner");
  const exported = store.exportBatch({ kind: "catalog" });
  const digest = (x) =>
    createHash("sha256").update(JSON.stringify(x)).digest("hex");
  const req = [
    {
      key: "character-agency",
      label: "How does character agency develop?",
      area: "characters",
      dimensionKey: "character-agency",
    },
    {
      key: "villain-incentives",
      label: "What constrains villain choices?",
      area: "characters",
      dimensionKey: "villain-incentives",
    },
  ];
  store.saveRequirements(
    { requirements: req, expectedDigest: digest([]) },
    "owner",
  );
  assert.equal(store.requirements().length, 2);
  assert.equal(store.exportBatch({ kind: "catalog" }).requirements.length, 2);
  assert.throws(
    () =>
      store.saveRequirements(
        { requirements: [], expectedDigest: digest([]) },
        "owner",
      ),
    /changed/,
  );
  let audit = store.auditCoverage();
  assert.equal(audit.titles[0].requirements[0].state, "supported");
  assert.equal(audit.titles[0].requirements[1].state, "missing");
  assert.ok(
    !JSON.stringify(audit).includes("SPOILER_PRIVATE_CHARACTER_OUTCOME"),
  );
  assert.ok(
    !JSON.stringify(store.attach(anime)).includes(
      "SPOILER_PRIVATE_CHARACTER_OUTCOME",
    ),
  );
  assert.equal(
    store.exportBatch({ kind: "profiles" }).profiles[0].dimensions[0]
      .containsSpoilers,
    true,
  );
  store.remember({ ...anime, synopsis: "Changed premise." });
  audit = store.auditCoverage();
  assert.equal(audit.titles[0].requirements[0].state, "changed");
  s.db.close();
});

test("imports above 1000 are accepted and receipt retries cannot duplicate or revive an undone import", () => {
  const b = bundle();
  b.profiles = Array.from({ length: 1001 }, (_, i) => ({
    ...structuredClone(b.profiles[0]),
    malId: i + 1,
    metadataFingerprint: null,
  }));
  assert.equal(validateResearchBundle(b).profiles.length, 1001);
  const db = storage(),
    s = createResearchStore(db),
    p = s.preview(b);
  const result = s.commit(b, p.revision, p.digest, "test", "upload:1");
  const replay = s.commit(b, p.revision, p.digest, "test", "upload:1");
  assert.equal(replay.replayed, true);
  assert.equal(replay.revision, result.revision);
  assert.equal(s.stats().profiles, 1001);
  const different = structuredClone(b);
  different.profiles[0].title = "Changed";
  assert.throws(
    () => s.commit(different, p.revision, p.digest, "test", "upload:1"),
    /different profiles/,
  );
  s.rollback(result.revision, "test");
  assert.throws(
    () => s.commit(b, p.revision, p.digest, "test", "upload:1"),
    /changed or undone/,
  );
  assert.equal(s.stats().profiles, 0);
  db.db.close();
});
test("unknown manual observations leave room for saved model evidence", () => {
  const db = storage(),
    s = createResearchStore(db),
    b = bundle(),
    o = b.profiles[0].observations[0];
  o.score = null;
  b.profiles[0].metadataFingerprint = null;
  const p = s.preview(b);
  s.commit(b, p.revision, p.digest, "test");
  db.sql.exec(
    "INSERT INTO model_catalog_profiles VALUES (?,?,?,?,?,?,?)",
    b.profiles[0].malId,
    "f",
    "v",
    JSON.stringify({ observations: [{ ...o, score: 0.8 }] }),
    Date.now(),
    "e",
    "r",
  );
  assert.equal(
    s.projection(b.profiles[0].malId).observations.find((x) => x.key === o.key)
      .score,
    0.8,
  );
  db.db.close();
});
test("independent reviewers on one service count separately, while mirrored evidence does not", () => {
  const b = bundle(),
    p = b.profiles[0];
  p.sources = [1, 2].map((i) => ({
    id: "r" + i,
    title: "Independent public review",
    type: "review",
    url: "https://myanimelist.net/reviews.php?id=" + i,
    accessedAt: p.analyzedAt,
    independenceKey: "author" + i,
  }));
  p.observations = [
    {
      ...p.observations[0],
      key: "animation-execution",
      basis: "critical",
      confidence: 0.9,
      sources: ["r1", "r2"],
    },
  ];
  assert.equal(
    validateResearchBundle(b).profiles[0].observations[0].confidence,
    0.9,
  );
  p.sources[1].independenceKey = "author1";
  assert.equal(
    validateResearchBundle(b).profiles[0].observations[0].confidence,
    0.55,
  );
});

test("new research traits produce distinct personalized bullets while private outcomes stay hidden", async () => {
  const { detailedExplanationReasons } =
    await import("../src/lib/recommend.js");
  const observations = [
    "proactive-lead",
    "mutual-support",
    "ambiguous-resolution",
  ].map((key) => ({ key, score: 1, confidence: 1, prominence: "central" }));
  const known = {
    id: 90001,
    title: "Known example",
    genres: [],
    synopsis: "",
    researchTaste: { version: 1, observations },
  };
  const candidate = { ...known, id: 90002, title: "Candidate" };
  const taste = buildTaste(
    { [known.id]: { anime: known, action: "good", at: 1 } },
    [],
  );
  const reasons = detailedExplanationReasons(candidate, taste);
  assert.ok(reasons.length >= 2);
  assert.ok(
    reasons.some((r) => r.includes("Known example") && r.includes("Good")),
  );
  assert.ok(reasons.some((r) => r.includes("initiates")));
  assert.ok(reasons.some((r) => r.includes("support")));
  assert.doesNotMatch(reasons.join(" "), /ambiguous|resolution|ending/i);
});
