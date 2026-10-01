import test from "node:test";
import assert from "node:assert/strict";
import { createDiagnostics } from "../src/lib/diagnostics.js";
import { createMalClient } from "../lib/mal.mjs";
import { requestTiming } from "../lib/timing.mjs";
import { tasteReadiness } from "../src/lib/recommend.js";

test("debug timings are opt-in, bounded and omit credentials, bodies and search text", async () => {
  const rows = [];
  const d = createDiagnostics({
    logger: { log: (_, row) => rows.push(row), table() {} },
  });
  const fetcher = async (_, options) => {
    assert.equal(
      options.headers["X-AnimeShuffle-Debug"],
      d.enabled ? "1" : undefined,
    );
    return Response.json(
      { token: "DO_NOT_LOG" },
      {
        headers: {
          "Server-Timing":
            "mal;dur=125.4, mal_queue;dur=7, cache_hits;dur=1, unsafe;desc=DO_NOT_LOG",
        },
      },
    );
  };
  await d.request(fetcher, "/api/search?q=PRIVATE_SEARCH", {
    method: "GET",
    headers: {},
  });
  assert.equal(rows.length, 0);
  d.on();
  await d.request(fetcher, "/api/search?q=PRIVATE_SEARCH", {
    method: "GET",
    headers: {},
  });
  assert.equal(rows[0].mal, 125.4);
  assert.equal(rows[0].route, "/api/search");
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE_SEARCH|DO_NOT_LOG/);
  for (let i = 0; i < 205; i++) d.start("operation")();
  assert.equal(d.report().length, 200);
  d.off();
  const count = rows.length;
  d.start("disabled")();
  assert.equal(rows.length, count);
});

test("MAL server timing distinguishes fresh responses, cache hits and failures", async () => {
  const client = createMalClient({
    clientId: "SECRET",
    interval: 0,
    fetcher: async (url) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json(
        { id: 1 },
        { status: url.includes("/2") ? 503 : 200 },
      );
    },
  });
  const first = requestTiming(client, true);
  await first.mal.request("/anime/1", { publicCache: true });
  assert.ok(Number(first.header().match(/(?:^|, )mal;dur=([\d.]+)/)[1]) >= 1);
  const cached = requestTiming(client, true);
  await cached.mal.request("/anime/1", { publicCache: true });
  assert.match(cached.header(), /mal;dur=0.0, cache_hits;dur=1.0/);
  assert.doesNotMatch(cached.header(), /SECRET|anime/);
  const failed = requestTiming(client, true);
  await assert.rejects(failed.mal.request("/anime/2"));
  assert.ok(Number(failed.header().match(/(?:^|, )mal;dur=([\d.]+)/)[1]) >= 1);
  assert.equal(requestTiming(client, false).header(), "");
});

test("taste guidance counts MAL evidence without double counting reactions and asks for positive signals", () => {
  const list = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    genres: ["Action"],
    listStatus: { status: "completed" },
  }));
  assert.equal(tasteReadiness({}, [], {}).remaining, 8);
  assert.equal(tasteReadiness({}, list, {}).needsMore, false);
  const reactions = { 1: { action: "good", anime: list[0] } };
  assert.equal(tasteReadiness(reactions, list, {}).knownTitles, 8);
  const dropped = list.map((a) => ({
    ...a,
    listStatus: { status: "dropped" },
  }));
  assert.equal(tasteReadiness({}, dropped, {}).needsMore, true);
  assert.equal(
    tasteReadiness({}, [], { favoriteGenres: ["Action"] }).needsMore,
    true,
  );
});
