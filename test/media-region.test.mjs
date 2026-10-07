import test from "node:test";
import assert from "node:assert/strict";
import { regionAllows, countryCode } from "../lib/media-region.mjs";
import { createTrailerService } from "../lib/trailers.mjs";
import { catalogPreview } from "../src/lib/media-data.js";
import { normalizeCandidate } from "../lib/candidate-catalog.mjs";

test("regional availability respects allowed/blocked lists and never guesses unknown countries", () => {
  assert.equal(regionAllows({ allowed: ["US"] }, "US"), true);
  assert.equal(regionAllows({ allowed: ["JP"] }, "US"), false);
  assert.equal(regionAllows({ allowed: [] }, "US"), false);
  assert.equal(regionAllows({ blocked: ["US"] }, "US"), false);
  assert.equal(regionAllows({ blocked: ["JP"] }, "US"), true);
  assert.equal(regionAllows({ blocked: [] }, null), true);
  assert.equal(regionAllows(null, null), true);
  assert.equal(regionAllows(undefined, "US"), false);
  assert.equal(regionAllows({ allowed: "US" }, "US"), false);
  assert.equal(regionAllows({ blocked: ["US"] }, null), false);
  assert.equal(regionAllows({ allowed: ["US"], blocked: ["US"] }, "US"), false);
  assert.equal(countryCode("XX"), null);
  assert.equal(
    catalogPreview({ previewVideoId: "abcdefghijk" }),
    null,
    "Old catalog entries cannot bypass regional checks",
  );
  const a = normalizeCandidate({
    mal_id: 1,
    title: "Test",
    trailer: {
      youtube_id: "abcdefghijk",
      region_restriction: { allowed: ["JP"] },
    },
  });
  assert.equal(
    a.previewVideoId,
    undefined,
    "Restricted catalog trailers fall back to country-aware list",
  );
});
test("one shared metadata cache produces different country-safe lists per request", async () => {
  let calls = 0;
  const service = createTrailerService({
    fetcher: async () => {
      calls++;
      return Response.json({
        data: {
          promo: [
            {
              title: "US",
              trailer: {
                youtube_id: "aaaaaaaaaaa",
                region_restriction: { allowed: ["US"] },
              },
            },
            {
              title: "JP",
              trailer: {
                youtube_id: "bbbbbbbbbbb",
                region_restriction: { blocked: ["US"] },
              },
            },
            {
              title: "World",
              trailer: { youtube_id: "ccccccccccc", region_restriction: null },
            },
            { title: "Unknown", trailer: { youtube_id: "ddddddddddd" } },
          ],
        },
      });
    },
  });
  const us = await service.get(42, "US"),
    jp = await service.get(42, "JP"),
    unknown = await service.get(42);
  assert.deepEqual(
    us.trailers.map((t) => t.title),
    ["US", "World"],
  );
  assert.deepEqual(
    jp.trailers.map((t) => t.title),
    ["JP", "World"],
  );
  assert.deepEqual(
    unknown.trailers.map((t) => t.title),
    ["World"],
  );
  assert.equal(calls, 1);
});
