import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createOfficialTraitApi,
  createDiskApiCache,
  retryAfterMs,
  TraitApiError,
} from "../lib/official-trait-api.mjs";
import {
  readAnimeInput,
  validateMappings,
  mapApiTraits,
  mappingCoverage,
} from "../lib/api-trait-import.mjs";
import { validateResearchBundle } from "../lib/research-profiles.mjs";
import { mergeResearchProfile } from "../lib/research-merge.mjs";
import { runApiTraitBatch } from "../scripts/import-api-traits.mjs";

const mappings = JSON.parse(
  await readFile(
    new URL("../data/api-trait-mappings.json", import.meta.url),
    "utf8",
  ),
);
const stamp = "2026-01-01T00:00:00.000Z";
const fixture = (id = 1, labels = ["Martial Arts"]) => ({
  id,
  title: `Anime ${id}`,
  genres: labels.map((name) => ({ name })),
});
const response = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
const evidence = (labels, provider = "mal") => ({
  provider,
  data: fixture(),
  labels,
  url:
    provider === "mal"
      ? "https://api.myanimelist.net/v2/anime/1"
      : "https://api.themoviedb.org/3/tv/1/keywords",
  accessedAt: stamp,
  cached: false,
});
const entry = { malId: 1, title: "Test anime", metadataFingerprint: null };
async function temp(t) {
  const dir = await mkdtemp(join(tmpdir(), "anime-api-traits-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("official endpoints, credential headers, cache, and offline resume", async (t) => {
  const cache = createDiskApiCache(await temp(t));
  const calls = [];
  const api = createOfficialTraitApi({
    malClientId: "test-secret",
    cache,
    fetcher: async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, "manual");
      assert.equal(options.headers["X-MAL-CLIENT-ID"], "test-secret");
      assert.match(
        url,
        /^https:\/\/api\.myanimelist\.net\/v2\/anime\/1\?fields=/,
      );
      assert.ok(!url.includes("test-secret"));
      return response(fixture());
    },
  });
  await api.mal(1);
  await api.mal(1);
  assert.equal(calls.length, 1);
  const offline = createOfficialTraitApi({
    cache,
    offline: true,
    fetcher: () => assert.fail("offline must never fetch"),
  });
  assert.equal((await offline.mal(1)).cached, true);
  await assert.rejects(offline.mal(5), /offline_cache_miss/);
});

test("404 skips without retry; 403 pauses provider; no response bodies leak", async () => {
  let count = 0;
  const api = createOfficialTraitApi({
    malClientId: "secret",
    intervalMs: 0,
    fetcher: async () => {
      count++;
      return response(
        { error: "sensitive upstream body" },
        count === 1 ? 404 : 403,
      );
    },
  });
  await assert.rejects(
    api.mal(1),
    (e) => e.status === 404 && !e.message.includes("sensitive"),
  );
  assert.equal(count, 1);
  await assert.rejects(api.mal(2), (e) => e.status === 403);
  await assert.rejects(api.mal(3), (e) => e.status === 403);
  assert.equal(count, 2);
});

test("429 Retry-After, network and 5xx retries are bounded", async () => {
  let clock = Date.parse(stamp),
    count = 0;
  const sleeps = [];
  const api = createOfficialTraitApi({
    malClientId: "id",
    now: () => clock,
    intervalMs: 0,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    fetcher: async () => {
      count++;
      if (count === 1) return response({}, 429, { "Retry-After": "3" });
      if (count === 2) throw Error("network with secret");
      if (count === 3) return response({}, 503);
      return response(fixture());
    },
  });
  assert.equal((await api.mal(1)).data.id, 1);
  assert.equal(count, 4);
  assert.deepEqual(sleeps, [3000, 2000, 4000]);
  assert.equal(
    retryAfterMs("Thu, 01 Jan 2026 00:00:09 GMT", Date.parse(stamp)),
    9000,
  );
  assert.equal(retryAfterMs("invalid", Date.parse(stamp)), 0);
});

test("long Retry-After stops instead of retrying early", async () => {
  let calls = 0;
  const api = createOfficialTraitApi({
    malClientId: "id",
    sleep: () => assert.fail("must not wait and retry early"),
    fetcher: async () => {
      calls++;
      return response({}, 429, { "Retry-After": "120" });
    },
  });
  await assert.rejects(api.mal(1), (e) => e.status === 429);
  await assert.rejects(api.mal(2), (e) => e.status === 429);
  assert.equal(calls, 1);
});

test("HTML, redirects, wrong IDs and missing schema are rejected", async () => {
  for (const reply of [
    new Response("<html>blocked</html>", {
      headers: { "Content-Type": "text/html" },
    }),
    response({}, 302),
    response(fixture(9)),
    response({ id: 1, title: "Missing genres" }),
  ]) {
    const api = createOfficialTraitApi({
      malClientId: "id",
      fetcher: async () => reply,
    });
    await assert.rejects(api.mal(1), TraitApiError);
  }
});

test("TMDB requires explicit adaptation scope and animation, supports TV/movie keyword shapes", async () => {
  for (const type of ["tv", "movie"]) {
    const calls = [];
    const api = createOfficialTraitApi({
      tmdbToken: "test-token",
      intervalMs: 0,
      fetcher: async (url, options) => {
        calls.push(url);
        assert.equal(options.headers.Authorization, "Bearer test-token");
        return response(
          url.endsWith("/keywords")
            ? {
                id: 7,
                [type === "tv" ? "results" : "keywords"]: [
                  { name: "found family" },
                ],
              }
            : { id: 7, genres: [{ id: 16 }] },
        );
      },
    });
    await assert.rejects(api.tmdb({ id: 7, type }), /exact_adaptation/);
    assert.equal(calls.length, 0);
    assert.deepEqual(
      (await api.tmdb({ id: 7, type, scopeVerified: true })).labels,
      ["found family"],
    );
    assert.equal(calls.length, 2);
  }
  const liveAction = createOfficialTraitApi({
    tmdbToken: "token",
    fetcher: async () => response({ id: 7, genres: [{ id: 18 }] }),
  });
  await assert.rejects(
    liveAction.tmdb({ id: 7, type: "tv", scopeVerified: true }),
    /animation_identity/,
  );
});

test("input exports preserve fingerprints, reject duplicates and malformed IDs", () => {
  const fp = "a".repeat(64);
  assert.equal(
    readAnimeInput({ catalog: [{ id: 1, metadataFingerprint: fp }] })[0]
      .metadataFingerprint,
    fp,
  );
  assert.equal(
    readAnimeInput({ entries: [{ anime: { mal_id: 5 } }] })[0].malId,
    5,
  );
  assert.equal(readAnimeInput({ tasks: [{ malId: 20 }] })[0].malId, 20);
  for (const bad of [
    [1, 1],
    [0],
    ["1"],
    [],
    { catalog: [{ id: 1, metadataFingerprint: "fake" }] },
  ])
    assert.throws(() => readAnimeInput(bad));
});

test("full vocabulary coverage is honest; broad tags cannot generate granular traits", () => {
  const coverage = mappingCoverage(validateMappings(mappings));
  assert.equal(coverage.totalTraits, 3188);
  assert.equal(coverage.detailedTraits, 3000);
  assert.equal(coverage.ruleCoveredTraits, 12);
  assert.equal(coverage.noMappingKeys.length, 3176);
  const result = mapApiTraits(
    entry,
    [evidence(["Space", "School", "Mecha", "Reincarnation"])],
    mappings,
  );
  assert.equal(result.profile, null);
  assert.equal(result.report.unknownTraits, 3188);
  assert.equal(result.report.unmatchedLabels.length, 4);
});

test("mapping output passes website validator and preserves unknowns and spoiler flags", () => {
  const result = mapApiTraits(
    entry,
    [
      evidence([" MARTIAL   ARTS ", "Action"]),
      evidence(["martial arts", "found family"], "tmdb"),
    ],
    mappings,
  );
  assert.equal(result.profile.observations.length, 2);
  const martial = result.profile.observations.find(
    (o) => o.key === "martial-technique",
  );
  assert.equal(martial.confidence, 0.6);
  assert.equal(martial.prominence, "unknown");
  assert.equal(martial.sources.length, 2);
  assert.equal(martial.containsSpoilers, true);
  assert.equal(result.report.unknownTraits, 3186);
  assert.equal(
    result.profile.coverage.filter((c) => c.state === "not-researched").length,
    11,
  );
  validateResearchBundle({
    format: "anime-shuffle-research",
    schemaVersion: 1,
    profiles: [result.profile],
  });
  const researched = {
    ...result.profile,
    observations: [
      {
        ...martial,
        confidence: 0.95,
        evidence: "Previously researched evidence.",
      },
    ],
  };
  const merged = mergeResearchProfile(researched, result.profile);
  assert.ok(JSON.stringify(merged).includes("Previously researched evidence."));
});

test("custom rules accept eligible detailed keys, reject quality traits and invented keys", () => {
  const rule = {
    provider: "mal",
    labels: ["Hypothetical precisely matching provider label"],
    key: "technology-memory-recording",
    rationale: "Reviewed explicit equivalent tag.",
    containsSpoilers: true,
  };
  const custom = { version: "custom-test", rules: [rule] };
  validateMappings(custom);
  const result = mapApiTraits(entry, [evidence(rule.labels)], custom);
  assert.equal(result.profile.observations[0].key, rule.key);
  for (const key of ["animation-execution", "invented-key"])
    assert.throws(() =>
      validateMappings({ ...custom, rules: [{ ...rule, key }] }),
    );
});

test("batch continues past 404, exports partial success, then resumes from disk cache", async (t) => {
  const output = await temp(t);
  let calls = 0;
  const cache = createDiskApiCache(join(output, "cache"));
  const api = createOfficialTraitApi({
    cache,
    malClientId: "id",
    intervalMs: 0,
    fetcher: async (url) => {
      calls++;
      const id = Number(url.match(/anime\/(\d+)/)[1]);
      return id === 5
        ? response({}, 404)
        : response(fixture(id, id === 20 ? ["School"] : ["Martial Arts"]));
    },
  });
  const entries = readAnimeInput([1, 5, 20]);
  const report = await runApiTraitBatch({ entries, api, mappings, output });
  assert.equal(report.processedTitles, 3);
  assert.equal(report.failedTitles, 1);
  assert.equal(report.importableProfiles, 1);
  assert.equal(calls, 3);
  const bundle = JSON.parse(
    await readFile(join(output, "research-results.json"), "utf8"),
  );
  assert.equal(validateResearchBundle(bundle).profiles.length, 1);
  const resumed = createOfficialTraitApi({
    cache,
    malClientId: "id",
    intervalMs: 0,
    fetcher: async () => {
      calls++;
      return response(fixture(5));
    },
  });
  const next = await runApiTraitBatch({
    entries,
    api: resumed,
    mappings,
    output,
  });
  assert.equal(calls, 4);
  assert.equal(next.importableProfiles, 2);
  assert.equal(next.apiStats.cacheHits, 2);
});

test("primary authentication failure checkpoints pending IDs; no-match outputs are not fake research", async (t) => {
  const output = await temp(t);
  const api = createOfficialTraitApi({
    malClientId: "id",
    fetcher: async () => response({}, 401),
  });
  const report = await runApiTraitBatch({
    entries: readAnimeInput([1, 2]),
    api,
    mappings,
    output,
  });
  assert.equal(report.interrupted, true);
  assert.deepEqual(report.pendingIds, [2]);
  assert.equal(report.failedTitles, 1);
  const saved = JSON.parse(
    await readFile(join(output, "research-results.json"), "utf8"),
  );
  assert.equal(saved.uploadReady, false);
  assert.equal(saved.format, "anime-shuffle-api-no-matches");
});
