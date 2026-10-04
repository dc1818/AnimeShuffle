import test from "node:test";
import assert from "node:assert/strict";
import { normalize, fields, catalogFields } from "../lib/mal.mjs";
import { movieContinuity } from "../src/lib/movie-continuity.js";
import {
  normalizePreferences,
  matchesPreferences,
} from "../src/lib/preferences.js";
import { chooseNext, rankRecommendations } from "../src/lib/recommend.js";

const film = (id, background = "") =>
  normalize({
    id,
    title: `Film ${id}`,
    media_type: "movie",
    nsfw: "white",
    rating: "pg_13",
    background,
    genres: [{ name: "Adventure" }],
    num_episodes: 1,
  });

test("MAL detail background supplies continuity evidence without exposing its text", () => {
  assert.ok(fields.split(",").includes("background"));
  assert.ok(!catalogFields.split(",").includes("background"));
  const a = film(
    1,
    "This movie is non-canon. Spoiler-containing background follows.",
  );
  assert.equal(a.continuity, "non_canon");
  assert.equal(a.background, undefined);
  assert.equal(
    movieContinuity({
      format: "movie",
      title: "Film (2020)",
      background: "Film (2020) is a non-canonical story.",
    }),
    "non_canon",
  );
});

test("continuity does not infer non-canon from original scripts, relations, negation or another film", () => {
  for (const background of [
    "This movie is an original story.",
    "This movie is not non-canon.",
    "Another movie is non-canon.",
    "Unlike the non-canon movie, this film follows the manga.",
    "This movie is arguably non-canon.",
    "This movie is non-canon, but its status is disputed.",
    "This movie is non-canon. It is now considered canon.",
    "",
  ])
    assert.equal(film(1, background).continuity, "unknown", background);
  assert.equal(
    movieContinuity({ format: "tv", background: "This movie is non-canon." }),
    "unknown",
  );
});

test("non-canon defaults off for both feeds, can be enabled, and never filters saved watchlist items", () => {
  assert.equal(normalizePreferences({}).includeNonCanonMovies, false);
  assert.equal(
    normalizePreferences({ includeNonCanonMovies: "true" })
      .includeNonCanonMovies,
    false,
  );
  const a = film(1, "This film is not considered canon."),
    b = film(2);
  assert.equal(chooseNext([a, b], {}).anime.id, 2);
  assert.deepEqual(
    rankRecommendations([a, b]).map((p) => p.anime.id),
    [2],
  );
  const preferences = normalizePreferences({ includeNonCanonMovies: true });
  assert.equal(chooseNext([a], { preferences }).anime.id, 1);
  assert.equal(rankRecommendations([a], { preferences }).length, 1);
  assert.ok(
    matchesPreferences(a, {}),
    "watchlist filters must not hide already-saved movies",
  );
});
