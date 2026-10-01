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

test("genre dropdown combines with other filters and favorites affect watch-first ordering", () => {
  assert.deepEqual(
    orderWatchlist([a, b, c, d], { genre: "Action", release: "available" }).map(
      (x) => x.anime.id,
    ),
    [1, 3],
  );
  assert.equal(
    orderWatchlist([a, b], {
      tastePreferences: { favoriteGenres: ["Romance"] },
    })[0].anime.id,
    2,
  );
});

test("text export includes titles, release, runtime, dates and MAL links", async () => {
  const { watchlistText } = await import("../src/lib/watchlist.js");
  const text = watchlistText([a, d, c]);
  assert.match(text, /3 anime/);
  assert.match(text, /https:\/\/myanimelist.net\/anime\/4/);
  assert.match(text, /Not yet aired/);
  assert.match(text, /Added: Unknown/);
  assert.match(text, /~4h 48m total/);
});

test("JSON backups round trip and reject invalid input without trusting image URLs", async () => {
  const { watchlistBackup, parseWatchlistBackup, newWatchlistEntries } =
    await import("../src/lib/watchlist.js");
  const text = watchlistBackup([a, b, c, a]);
  const entries = parseWatchlistBackup(text);
  assert.equal(entries[0].anime.title, a.anime.title);
  assert.equal(entries[0].addedAt, 100);
  assert.equal(entries[2].addedAt, null);
  assert.deepEqual(
    newWatchlistEntries(entries, { 2: { action: "bad" } }).map(
      (x) => x.anime.id,
    ),
    [1, 3],
  );
  assert.throws(() => parseWatchlistBackup("plain text"), /valid JSON/);
  assert.throws(() => parseWatchlistBackup('{"version":2}'), /Unsupported/);
  assert.throws(
    () =>
      parseWatchlistBackup(
        watchlistBackup([{ anime: { id: -1, title: "bad" } }]),
      ),
    /invalid anime/,
  );
  for (const invalid of [
    { app: "other-app", version: 1, entries: [] },
    { app: "anime-shuffle", version: 1, entries: "wrong type" },
    { app: "anime-shuffle", version: 1, exportedAt: "invalid", entries: [] },
    {
      app: "anime-shuffle",
      version: 1,
      entries: [{ anime: { id: 10000001, title: "Bad" } }],
    },
    {
      app: "anime-shuffle",
      version: 1,
      entries: [{ anime: { id: 1, title: "Bad", genres: "Action" } }],
    },
  ])
    assert.throws(() => parseWatchlistBackup(JSON.stringify(invalid)));
  const unsafe = parseWatchlistBackup(
    watchlistBackup([{ anime: { ...a.anime, image: "javascript:alert(1)" } }]),
  );
  assert.equal(unsafe[0].anime.image, "");
});

test("combined watchlist merges MAL plans without duplicate reactions and excludes subsequent progress", async () => {
  const { combinedWatchlist, missingMalPlans, watchlistBackup } =
    await import("../src/lib/watchlist.js");
  const anime = (id) => ({ id, title: `Anime ${id}`, genres: ["Action"] });
  const list = [
    { ...anime(1), listStatus: { status: "plan_to_watch" } },
    { ...anime(2), listStatus: { status: "plan_to_watch" } },
    { ...anime(3), listStatus: { status: "completed" } },
    { ...anime(4), listStatus: { status: "dropped" } },
    { ...anime(6), listStatus: { status: "plan_to_watch" } },
  ];
  const reactions = Object.fromEntries(
    [1, 3, 4, 5].map((id) => [
      id,
      { anime: anime(id), action: "watch", at: 123 },
    ]),
  );
  reactions[6] = { anime: anime(6), action: "good", at: 456 };
  const entries = combinedWatchlist(reactions, list);
  assert.deepEqual(
    entries.map((e) => e.anime.id),
    [1, 2, 5],
  );
  assert.equal(entries[0].site, true);
  assert.equal(entries[0].mal, true);
  assert.equal(entries[0].addedAt, 123);
  assert.equal(entries[1].addedAt, null);
  assert.deepEqual(
    missingMalPlans(reactions, list).map((e) => e.anime.id),
    [5],
  );
  assert.equal(JSON.parse(watchlistBackup(entries)).entries.length, 3);
  assert.equal(
    reactions[2],
    undefined,
    "MAL import must not fabricate an explicit reaction",
  );
});
