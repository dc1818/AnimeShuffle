import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function worker() {
  const handlers = {},
    saved = [],
    deleted = [];
  let network = async () => new Response("live");
  const cache = {
    add: async (request) => saved.push(request.url),
    match: async () => new Response("offline"),
  };
  const origin = "https://animeshuffle.com";
  vm.runInNewContext(await readFile("public/sw.js", "utf8"), {
    URL,
    Response,
    Request: class extends Request {
      constructor(url, options) {
        super(new URL(url, origin), options);
      }
    },
    fetch: (request) => network(request),
    caches: {
      open: async () => cache,
      keys: async () => [
        "anime-shuffle-offline-v0",
        "anime-shuffle-offline-v1",
        "unrelated",
      ],
      delete: async (name) => deleted.push(name),
    },
    self: {
      location: { origin },
      addEventListener: (name, fn) => (handlers[name] = fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
  });
  return {
    saved,
    deleted,
    network(fn) {
      network = fn;
    },
    async lifecycle(name) {
      let work;
      handlers[name]({ waitUntil: (promise) => (work = promise) });
      await work;
    },
    request(path, options = {}) {
      let response;
      handlers.fetch({
        request: {
          url: new URL(path, origin).href,
          method: "GET",
          mode: "navigate",
          ...options,
        },
        respondWith: (promise) => (response = promise),
      });
      return response;
    },
  };
}
test("offline cache is limited to public fallback and cleans only its own old versions", async () => {
  const sw = await worker();
  await sw.lifecycle("install");
  await sw.lifecycle("activate");
  assert.deepEqual(sw.saved, ["https://animeshuffle.com/offline.html"]);
  assert.deepEqual(sw.deleted, ["anime-shuffle-offline-v0"]);
});
test("network errors show offline screen; server errors and redirects remain untouched", async () => {
  const sw = await worker();
  assert.equal(await (await sw.request("/")).text(), "live");
  sw.network(async () => new Response("database unavailable", { status: 503 }));
  assert.equal((await sw.request("/")).status, 503);
  sw.network(
    async () =>
      new Response(null, { status: 302, headers: { Location: "/auth/start" } }),
  );
  assert.equal((await sw.request("/")).headers.get("location"), "/auth/start");
  sw.network(async () => {
    throw Error("offline");
  });
  assert.equal(await (await sw.request("/")).text(), "offline");
});
test("auth, account reads/writes, callbacks, admin, third parties and bundles bypass the worker", async () => {
  const sw = await worker();
  for (const path of [
    "/auth/start",
    "/auth/callback?code=secret",
    "/api/account/state",
    "/api/session",
    "/admin",
    "/?connected=1",
    "/?auth_error=state",
    "/app.js",
    "https://myanimelist.net/v1/oauth2/authorize",
  ]) {
    assert.equal(sw.request(path), undefined, path);
  }
  assert.equal(sw.request("/", { method: "POST" }), undefined);
  assert.equal(sw.request("/", { mode: "cors" }), undefined);
});
