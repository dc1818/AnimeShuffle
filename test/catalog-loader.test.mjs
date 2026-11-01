import test from "node:test";
import assert from "node:assert/strict";
import { loadCatalogPage, publicCatalogPage } from "../src/lib/catalog-loader.js";
const url = "/api/catalog?source=shuffle&offset=0&seed=1818&provider=tenrai&preferences=%7B%22scoreMin%22%3A7%7D";
const page = { data: [{ id: 7 }], nextOffset: 50 };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("warm server catalog never starts a duplicate browser read", async () => {
  let reads = 0;
  const sources = [];
  assert.equal(await loadCatalogPage(url, async () => page, {
    hedgeMs: 5, publicPage: async () => { reads++; return page; },
    onSource: (s) => sources.push(s),
  }), page);
  await pause(10);
  assert.equal(reads, 0);
  assert.deepEqual(sources, ["server"]);
});

test("stalled hosted catalog can finish through the identical browser request without waiting for timeout", async () => {
  let release;
  const sources = [];
  const result = await loadCatalogPage(url, () => new Promise(r => { release = r; }), {
    hedgeMs: 0,
    publicPage: async (requested) => { assert.equal(requested, url); return page; },
    onSource: s => sources.push(s),
  });
  assert.equal(result, page);
  release({ data: [{ id: 999 }], nextOffset: null });
  await pause(0);
  assert.deepEqual(sources, ["browser"], "late server response cannot replace a chosen page");
});

test("hosted failures start recovery immediately; both failures preserve normal MAL fallback", async () => {
  const error = Object.assign(Error("Provider unavailable"), { status: 503 });
  let attempts = 0;
  assert.equal(await loadCatalogPage(url, async () => { throw error; }, {
    hedgeMs: 60000, publicPage: async () => { attempts++; return page; },
  }), page);
  assert.equal(attempts, 1);
  await assert.rejects(loadCatalogPage(url, async () => { throw error; }, {
    publicPage: async () => { throw Error("Public quota exhausted"); },
  }), e => e === error);
});

test("validation and authentication errors do not trigger public recovery", async () => {
  let calls = 0;
  for (const status of [400, 401, 403]) {
    const error = Object.assign(Error("Rejected"), { status });
    await assert.rejects(loadCatalogPage(url, async () => { throw error; }, {
      publicPage: async () => { calls++; return page; },
    }), e => e === error);
  }
  assert.equal(calls, 0);
});

test("public catalog preserves filters, normalization and preview validation and sends no credentials", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, options) => {
    const requested = new URL(input);
    calls.push(requested);
    assert.equal(requested.origin, "https://api.tenrai.org");
    assert.equal(requested.pathname, "/v1/anime");
    assert.equal(requested.searchParams.get("min_score"), "7");
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.redirect, "error");
    assert.deepEqual(options.headers, { Accept: "application/json" });
    return Response.json({ data: [{ mal_id: 123, title: "Public candidate", rating: "PG-13 - Teens 13 or older", type: "TV", trailer: { youtube_id: "abcdefghijk", region_restriction: null } }], pagination: { has_next_page: false, last_visible_page: 1 } });
  };
  try {
    const result = await publicCatalogPage(url);
    assert.equal(result.data[0].id, 123);
    assert.equal(result.data[0].previewVideoId, "abcdefghijk");
    assert.equal(result.nextOffset, null);
    assert.equal(result.provider, "tenrai");
    await publicCatalogPage(url);
    assert.equal(calls.length, 1, "successful public catalog pages share their cache");
  } finally { globalThis.fetch = original; }
});
