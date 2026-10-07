import test from "node:test";
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
