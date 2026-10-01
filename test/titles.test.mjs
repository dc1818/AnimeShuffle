import test from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../lib/mal.mjs";
import { primaryTitle, englishTitle, matchesTitle } from "../src/lib/titles.js";
import {
  orderWatchlist,
  parseWatchlistBackup,
  watchlistBackup,
} from "../src/lib/watchlist.js";
import { normalizePreferences } from "../src/lib/preferences.js";
const anime = normalize({
  id: 24833,
  title: "Ansatsu Kyoushitsu",
  alternative_titles: {
    en: "Assassination Classroom",
    ja: "暗殺教室",
    synonyms: ["AssClass"],
  },
  nsfw: "white",
  media_type: "tv",
});
test("MAL titles search by English, romanized Japanese, native Japanese and synonyms", () => {
  assert.equal(primaryTitle(anime), "Ansatsu Kyoushitsu");
  assert.equal(englishTitle(anime), "Assassination Classroom");
  for (const query of ["ASSASSINATION", "ansatsu", "暗殺", "AssClass"]) {
    assert.ok(matchesTitle(anime, query));
    assert.equal(orderWatchlist([{ anime }], { query }).length, 1);
  }
  assert.equal(orderWatchlist([{ anime }], { query: "unrelated" }).length, 0);
});
test("backup imports and favorite preferences retain all supplied title variants", () => {
  const imported = parseWatchlistBackup(watchlistBackup([{ anime }]));
  assert.equal(imported[0].anime.englishTitle, anime.englishTitle);
  assert.equal(imported[0].anime.japaneseTitle, anime.japaneseTitle);
  assert.deepEqual(imported[0].anime.synonyms, anime.synonyms);
  const favorite = normalizePreferences({ favoriteAnime: [anime] })
    .favoriteAnime[0];
  assert.equal(favorite.englishTitle, anime.englishTitle);
  assert.ok(matchesTitle(favorite, "暗殺"));
});
test("older saved English titles remain available and identical or absent translations are not duplicated", () => {
  const legacy = {
    id: 1,
    title: "Assassination Classroom",
    originalTitle: "Ansatsu Kyoushitsu",
  };
  assert.equal(primaryTitle(legacy), "Ansatsu Kyoushitsu");
  assert.equal(englishTitle(legacy), "Assassination Classroom");
  assert.equal(
    englishTitle({ title: "Cowboy Bebop", englishTitle: "Cowboy Bebop" }),
    "",
  );
  assert.equal(englishTitle({ title: "No translation" }), "");
});
