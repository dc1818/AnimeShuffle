import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeStore } from "../src/lib/store.js";
const anime = {
  id: 1,
  title: "Candidate",
  genres: ["Action"],
  format: "tv",
  nsfw: "white",
  prequels: [],
};
function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
}
test("React store keeps auto-add opt-in and preserves MAL entry when Undo is refused", async () => {
  let writes = 0,
    starts = 0;
  const store = createAnimeStore({
    storage: memory(),
    request: async (url, options) => {
      const ok = (data) => new Response(JSON.stringify(data));
      if (url === "/api/session") {
        starts++;
        return ok({ configured: true, connected: true, csrf: "csrf" });
      }
      if (url === "/api/profile") return ok({ id: 7, name: "Viewer" });
      if (url.startsWith("/api/list"))
        return ok({ data: [], nextOffset: null });
      if (url.startsWith("/api/catalog"))
        return ok({ data: [anime], nextOffset: null });
      if (url === "/api/anime/1") return ok(anime);
      if (url === "/api/plan") {
        writes++;
        assert.equal(options.headers["X-CSRF-Token"], "csrf");
        return ok({ added: true, receipt: "receipt" });
      }
      if (url === "/api/plan/undo")
        return new Response(
          JSON.stringify({ error: "Entry changed on MAL." }),
          { status: 409 },
        );
      throw Error("Unexpected request " + url);
    },
  });
  await Promise.all([store.initialize(), store.initialize()]);
  assert.equal(starts, 1, "StrictMode must not duplicate initialization");
  await store.react("watch");
  assert.equal(writes, 0, "Auto-add defaults off");
  await store.undo();
  store.setSettings({ autoAdd: true });
  await store.react("watch");
  assert.equal(writes, 1);
  await store.undo();
  assert.equal(store.getSnapshot().reactions[1], undefined);
  assert.equal(
    store.getSnapshot().list.length,
    1,
    "Refused MAL undo must preserve local knowledge of its entry",
  );
  assert.match(store.getSnapshot().message, /Entry changed/);
});
test("clearing reactions and removing saved entries cannot leave stale Undo history", async () => {
  const store = createAnimeStore({
    storage: memory(),
    request: async () =>
      new Response(JSON.stringify({ configured: false, connected: false })),
  });
  await store.initialize();
  await store.react("watch");
  store.removeSaved(1);
  assert.equal(store.getSnapshot().canUndo, false);
  await store.react("good");
  await store.clearLocal();
  assert.equal(store.getSnapshot().canUndo, false);
  assert.deepEqual(store.getSnapshot().reactions, {});
});
