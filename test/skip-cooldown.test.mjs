import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
import {
  activeSkipCooldowns,
  SKIP_COOLDOWN_MS,
} from "../src/lib/skip-cooldown.js";
import { unlockedReactions } from "./recommendation-fixture.mjs";

function fixture() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const initial = { reactions: unlockedReactions(), onboardingComplete: true };
  storage.setItem("anime-shuffle:guest", JSON.stringify(initial));
  let clock = 1000000;
  function create(extra = {}) {
    return createAnimeStore({
      storage,
      browserBackup: null,
      staticMode: true,
      now: () => clock,
      ...extra,
    });
  }
  return {
    storage,
    create,
    advance: (delta) => {
      clock += delta;
    },
    saved: (key) =>
      JSON.parse(storage.getItem("anime-shuffle:" + (key || "guest"))),
  };
}

test("skip persists across reloads and preference edits and excludes both discovery and recommendations", async () => {
  const f = fixture();
  const store = f.create();
  await store.initialize();
  const id = store.getSnapshot().current.id;
  const before = structuredClone(store.getSnapshot().reactions);
  await store.loadRecommendations();
  assert.ok(
    store.getSnapshot().recommendationPicks.some((p) => p.anime.id === id),
  );
  await store.skip();
  assert.notEqual(store.getSnapshot().current?.id, id);
  assert.ok(
    !store.getSnapshot().recommendationPicks.some((p) => p.anime.id === id),
  );
  assert.equal(f.saved().skipUntil[id], 1000000 + SKIP_COOLDOWN_MS);
  assert.deepEqual(
    store.getSnapshot().reactions,
    before,
    "skip must not teach a dislike",
  );
  await store.saveViewingPreferences({});
  await store.savePreferences({});
  assert.notEqual(store.getSnapshot().current?.id, id);
  const reloaded = f.create();
  await reloaded.initialize();
  assert.notEqual(reloaded.getSnapshot().current?.id, id);
  await reloaded.loadRecommendations();
  assert.ok(
    !reloaded.getSnapshot().recommendationPicks.some((p) => p.anime.id === id),
  );
  assert.deepEqual(reloaded.getSnapshot().reactions, before);
});

test("skipped titles return to eligibility at the seven-day boundary without reload", async () => {
  const f = fixture(),
    store = f.create();
  await store.initialize();
  const id = store.getSnapshot().current.id;
  await store.skip();
  f.advance(SKIP_COOLDOWN_MS - 1);
  await store.loadRecommendations({ force: true });
  assert.ok(
    !store.getSnapshot().recommendationPicks.some((p) => p.anime.id === id),
  );
  f.advance(1);
  await store.loadRecommendations({ force: true });
  assert.ok(
    store.getSnapshot().recommendationPicks.some((p) => p.anime.id === id),
  );
  await store.retryBrowserSave();
  assert.equal(
    f.saved().skipUntil[id],
    undefined,
    "expired cooldowns are pruned from storage",
  );
});

test("Undo and explicit Revisit clear the persisted cooldown early", async () => {
  const f = fixture(),
    store = f.create();
  await store.initialize();
  const id = store.getSnapshot().current.id;
  await store.skip();
  await store.undo();
  assert.equal(store.getSnapshot().current.id, id);
  assert.equal(f.saved().skipUntil[id], undefined);
  await store.skip();
  await store.revisit();
  assert.deepEqual(f.saved().skipUntil, {});
  await store.loadRecommendations({ force: true });
  assert.ok(
    store.getSnapshot().recommendationPicks.some((p) => p.anime.id === id),
  );
});

test("running out of titles never silently recycles unexpired skips", async () => {
  const f = fixture(),
    store = f.create();
  await store.initialize();
  const seen = new Set();
  for (let n = 0; store.getSnapshot().current && n < 50; n++) {
    const id = store.getSnapshot().current.id;
    assert.ok(!seen.has(id), "a skipped title reappeared");
    seen.add(id);
    await store.skip();
  }
  assert.ok(seen.size > 0);
  assert.equal(store.getSnapshot().current, null);
  const reloaded = f.create();
  await reloaded.initialize();
  assert.equal(reloaded.getSnapshot().current, null);
  await reloaded.revisit();
  assert.ok(reloaded.getSnapshot().current);
});

test("guest skips do not leak into another account and account skips survive its reload", async () => {
  const f = fixture(),
    guest = f.create();
  await guest.initialize();
  const guestId = guest.getSnapshot().current.id;
  await guest.skip();
  f.storage.setItem(
    "anime-shuffle:local:viewer",
    JSON.stringify({
      reactions: unlockedReactions(),
      onboardingComplete: true,
    }),
  );
  const request = async () =>
    Response.json({
      configured: false,
      connected: false,
      account: { id: "local:viewer", provider: "local" },
      onboardingComplete: true,
    });
  const account = f.create({ staticMode: false, request });
  await account.initialize();
  await account.loadRecommendations();
  assert.ok(
    account
      .getSnapshot()
      .recommendationPicks.some((p) => p.anime.id === guestId),
  );
  const accountId = account.getSnapshot().current.id;
  await account.skip();
  assert.ok(f.saved("local:viewer").skipUntil[accountId]);
  const reloaded = f.create({ staticMode: false, request });
  await reloaded.initialize();
  await reloaded.loadRecommendations();
  assert.ok(
    !reloaded
      .getSnapshot()
      .recommendationPicks.some((p) => p.anime.id === accountId),
  );
  assert.deepEqual(Object.keys(f.saved().skipUntil), [String(guestId)]);
});

test("malformed and expired browser cooldowns do not suppress arbitrary titles", () => {
  assert.deepEqual(
    activeSkipCooldowns(
      {
        1: 1001,
        2: 1000,
        3: "1001",
        bad: 1001,
        0: 1001,
        4: Infinity,
        5: 1001 + SKIP_COOLDOWN_MS,
      },
      1000,
    ),
    { 1: 1001 },
  );
  assert.deepEqual(activeSkipCooldowns([1001], 1000), {});
});
