import test from "node:test";
import assert from "node:assert/strict";
import {
  taxonomyAnalytics,
  mergeTaxonomyAnalytics,
} from "../src/lib/taxonomy-analytics.js";
import { normalizePreferences } from "../src/lib/preferences.js";
import { publicAnime } from "../lib/research-profiles.mjs";
import { parseWatchlistBackup } from "../src/lib/watchlist.js";
import { guestAnalyticsSnapshot } from "../src/lib/guest-analytics.js";
import { cleanGuestSnapshot } from "../lib/guest-analytics.mjs";

test("coverage distinguishes direct, inherited and unknown without multiplying paths", () => {
  const a = { id: 1, genres: ["Real Robot", "Real Robot"], format: "tv" };
  const b = { id: 2, genres: ["Mecha", "Real Robot"], format: "tv" };
  const first = taxonomyAnalytics([a], [{ anime: a, action: "good" }]);
  const second = taxonomyAnalytics([b, { id: 3, format: "tv" }]);
  const combined = mergeTaxonomyAnalytics(first, second);
  const row = combined.nodes.find((n) => n.id === "mecha");
  assert.equal(row.direct, 1);
  assert.equal(row.inherited, 1);
  assert.equal(row.good, 1);
  assert.equal(combined.titleCount, 3);
  assert.equal(combined.contentCovered, 2);
  assert.equal(combined.nodes.find((n) => n.id === "war").inherited, 0);
  assert.throws(() =>
    mergeTaxonomyAnalytics(first, { ...second, version: "changed" }),
  );
});

test("category metadata survives account/watchlist, research and guest serialization", () => {
  const anime = {
    id: 12,
    title: "Example",
    adaptationSource: "Light novel",
    genres: [],
    themes: ["Real Robot"],
    demographics: ["Seinen"],
  };
  const at = Date.now();
  const restored = parseWatchlistBackup(
    JSON.stringify({
      app: "anime-shuffle",
      version: 1,
      entries: [{ anime, addedAt: at }],
    }),
  )[0].anime;
  const guest = cleanGuestSnapshot(
    guestAnalyticsSnapshot({
      reactions: { 12: { anime, action: "good", at } },
    }),
  ).reactions[0].anime;
  for (const copy of [
    publicAnime(anime),
    restored,
    guest,
    normalizePreferences({ favoriteAnime: [anime] }).favoriteAnime[0],
  ]) {
    assert.equal(copy.adaptationSource, anime.adaptationSource);
    assert.deepEqual(copy.themes, anime.themes);
    assert.deepEqual(copy.demographics, anime.demographics);
  }
});
