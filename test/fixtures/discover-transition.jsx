// Isolated real-store fixture: no production accounts or remote writes.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/App.jsx";
import { createAnimeStore } from "../../src/lib/store.js";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const catalog = Array.from({ length: 12 }, (_, i) => ({
  id: 990001 + i, title: `Transition sample ${i + 1}`,
  genres: ["Action"], format: "tv", nsfw: "white", rating: "pg13",
  status: "finished_airing", episodes: 12, prequels: [],
  synopsis: "A sample synopsis for testing card transitions without changing an account.",
}));
const values = new Map();
// Slow preview metadata exercises the real MediaReady gate; missing artwork
// uses the production built-in fallback, with no remote image requests.
window.fetch = async () => {
  await delay(450);
  return Response.json({ videoId: null, trailers: [], pictures: [] });
};
const store = createAnimeStore({
  storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
  browserBackup: { read: async () => null, write: async () => { await delay(600); } },
  // Hold background look-ahead so each action exercises an uncached next pick.
  prepareMedia: () => new Promise(() => {}),
  request: async url => {
    if (url === "/api/session") return Response.json({ configured: true, onboardingComplete: true });
    if (url.startsWith("/api/catalog")) return Response.json({ data: catalog, nextOffset: null });
    if (url.startsWith("/api/anime/")) {
      await delay(500);
      return Response.json(catalog.find(anime => anime.id === Number(url.split("/").pop())));
    }
    return Response.json({ profiles: {} });
  },
});
await store.initialize();
await store.savePreferences({});
store.setSettings({ dynamic: false });
window.transitionStore = store;
createRoot(document.getElementById("root")).render(<App store={{...store, initialize() {}}} />);
