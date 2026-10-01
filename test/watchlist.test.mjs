import test from "node:test";
import assert from "node:assert/strict";
import { orderWatchlist } from "../src/lib/watchlist.js";
const entry = (
  id,
  genre,
  duration,
  episodes,
  addedAt,
  status = "finished_airing",
) => ({
  anime: {
    id,
    title: `Anime ${id}`,
    genres: [genre],
    format: "tv",
    duration,
    episodes,
    status,
  },
  addedAt,
});
const a = entry(1, "Action", 24, 12, 100),
  b = entry(2, "Romance", 24, 24, 300),
  c = entry(3, "Action", 0, 0, null),
  d = entry(4, "Action", 24, 100, 200, "not_yet_aired");
test("watchlist orders known dates and full runtimes in either direction with unknown last", () => {
  const entries = [a, b, c, d];
  const ids = (sort) =>
    orderWatchlist(entries, { sort }).map((x) => x.anime.id);
  assert.deepEqual(ids("newest"), [2, 4, 1, 3]);
  assert.deepEqual(ids("oldest"), [1, 4, 2, 3]);
  assert.deepEqual(ids("shortest"), [1, 2, 4, 3]);
  assert.deepEqual(ids("longest"), [4, 2, 1, 3]);
});
test("watchlist combines taste, availability, search and discovery criteria without deleting entries", () => {
  const entries = [a, b, c, d];
  const reactions = {
    99: {
      action: "good",
      anime: { id: 99, genres: ["Romance"], format: "tv" },
    },
  };
  assert.equal(orderWatchlist(entries, { reactions })[0].anime.id, 2);
  assert.equal(orderWatchlist(entries, { reactions }).at(-1).anime.id, 4);
  assert.deepEqual(
    orderWatchlist(entries, {
      preferences: { lengths: ["short"], includeUnknown: false },
      release: "available",
    }).map((x) => x.anime.id),
    [1],
  );
  assert.deepEqual(
    orderWatchlist(entries, { query: "anime 2" }).map((x) => x.anime.id),
    [2],
  );
  assert.equal(entries.length, 4);
});
