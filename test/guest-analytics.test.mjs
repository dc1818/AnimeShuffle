import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
import { guestAnalyticsSnapshot } from "../src/lib/guest-analytics.js";

test("guest analytics identity survives browser reload and backups; signed-in sessions never report guest tastes", async () => {
  const local = new Map(),
    backup = new Map(),
    reports = [];
  let session = {
    configured: false,
    guestAnalyticsEnabled: true,
    csrf: "test-csrf",
  };
  const options = {
    storage: {
      getItem: (k) => local.get(k),
      setItem: (k, v) => local.set(k, v),
    },
    browserBackup: {
      read: async (k) => backup.get(k),
      write: async (k, v) => backup.set(k, structuredClone(v)),
    },
    request: async (url, init) => {
      if (url === "/api/session") return Response.json(session);
      if (url === "/api/guest/state") {
        reports.push({ body: JSON.parse(init.body), headers: init.headers });
        return Response.json({ tracked: true });
      }
      if (url === "/api/account/state")
        return Response.json({
          revision: 0,
          reactions: {},
          settings: {},
          preferences: {},
        });
      throw Error(url);
    },
  };
  let store = createAnimeStore(options);
  await store.initialize();
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(reports.length, 1);
  const token = reports[0].headers["X-AnimeShuffle-Guest"];
  assert.match(token, /^[a-f0-9]{32}$/);
  assert.equal(
    JSON.parse(local.get("anime-shuffle:guest")).guestAnalyticsToken,
    token,
  );
  local.delete("anime-shuffle:guest");
  store = createAnimeStore(options);
  await store.initialize();
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(reports[1].headers["X-AnimeShuffle-Guest"], token);
  session = {
    configured: false,
    guestAnalyticsEnabled: true,
    csrf: "test-csrf",
    account: { id: "member", provider: "local" },
    cloudSync: false,
  };
  store = createAnimeStore(options);
  await store.initialize();
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(reports.length, 2);
});

test("guest snapshots bound recent choices and strip private list/research material", () => {
  const reactions = Object.fromEntries(
    Array.from({ length: 1100 }, (_, i) => [
      i + 1,
      {
        action: "good",
        at: i + 1,
        anime: {
          id: i + 1,
          title: "Anime",
          genres: ["Action"],
          synopsis: "PRIVATE",
          listStatus: { score: 10 },
          researchTaste: { secret: "PRIVATE" },
          tokens: "PRIVATE",
        },
      },
    ]),
  );
  const snapshot = guestAnalyticsSnapshot({
    reactions,
    list: [{ secret: "PRIVATE" }],
    preferences: { favoriteAnime: [reactions[1].anime] },
    onboardingComplete: true,
  });
  assert.equal(snapshot.totalReactions, 1100);
  assert.equal(snapshot.reactions.length, 1000);
  assert.equal(snapshot.reactions[0].anime.id, 1100);
  assert.ok(!JSON.stringify(snapshot).includes("PRIVATE"));
  assert.ok(!JSON.stringify(snapshot).includes("listStatus"));
});
