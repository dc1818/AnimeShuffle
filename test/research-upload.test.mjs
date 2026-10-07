import test from "node:test";
import assert from "node:assert/strict";
import {
  splitResearchUpload,
  previewResearchUpload,
} from "../src/lib/research-upload.js";
const bundle = (count) => ({
  format: "anime-shuffle-research",
  schemaVersion: 1,
  profiles: Array.from({ length: count }, (_, i) => ({
    malId: i + 1,
    title: "Anime " + i,
  })),
});
test("upload has no total profile cap, splits at 1000 and validates IDs across all chunks", () => {
  const b = bundle(2501),
    chunks = splitResearchUpload(b);
  assert.deepEqual(
    chunks.map((c) => c.profiles.length),
    [1000, 1000, 501],
  );
  assert.equal(chunks.flatMap((c) => c.profiles).length, 2501);
  b.profiles[2500].malId = 1;
  assert.throws(() => splitResearchUpload(b), /unique/);
});
test("upload bounds actual UTF-8 request sizes and rejects an oversized single profile", () => {
  const b = bundle(20);
  b.profiles.forEach((p) => (p.title = "猫".repeat(100)));
  const chunks = splitResearchUpload(b, { maxBytes: 1000 });
  assert.ok(chunks.length > 1);
  for (const c of chunks)
    assert.ok(new TextEncoder().encode(JSON.stringify(c)).length <= 1000);
  assert.throws(() => splitResearchUpload(b, { maxBytes: 200 }), /too large/);
  assert.throws(() => splitResearchUpload(b, { chunkSize: 0 }), /settings/);
});
test("multi-chunk preview aggregates without writing and detects concurrent catalog changes", async () => {
  const chunks = splitResearchUpload(bundle(2501));
  let calls = 0;
  const api = async (path, { bundle: b }) => {
    assert.equal(path, "/api/admin/validate");
    calls++;
    return {
      revision: 7,
      count: b.profiles.length,
      newProfiles: b.profiles.length,
      replacements: 0,
      staleInputs: [],
      titles: b.profiles,
    };
  };
  const report = await previewResearchUpload(chunks, api);
  assert.equal(calls, 3);
  assert.equal(report.count, 2501);
  assert.equal(report.titles.length, 50);
  let revision = 0;
  await assert.rejects(
    previewResearchUpload(chunks, async () => ({
      ...report,
      revision: revision++,
    })),
    /changed during/,
  );
});
