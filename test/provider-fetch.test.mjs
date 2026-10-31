import test from "node:test";
import assert from "node:assert/strict";
import { createProviderFetch } from "../lib/provider-fetch.mjs";
import { createTrailerService } from "../lib/trailers.mjs";
const url = (path) => `https://api.tenrai.org/v1/anime/${path}`;

test("media and background reads share a two-request ceiling and media gets the next slot", async () => {
  const starts = [],
    releases = [];
  const fetcher = createProviderFetch(
    async (input) => {
      starts.push(input);
      await new Promise((r) => releases.push(r));
      return new Response("{}");
    },
    { spacingMs: 0 },
  );
  const a = fetcher(url("1/reviews")),
    b = fetcher(url("2/full")),
    c = fetcher(url("3/reviews")),
    d = fetcher(url("4/videos"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(starts.length, 2);
  releases.shift()();
  await a;
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(starts[2], url("4/videos"));
  releases.shift()();
  await b;
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(starts[3], url("3/reviews"));
  releases.forEach((r) => r());
  await Promise.all([c, d]);
});
test("provider cooldown respects Retry-After without blocking MAL or sending another request", async () => {
  let time = 1000,
    calls = 0;
  const fetcher = createProviderFetch(
    async (input) => {
      calls++;
      return input.includes("tenrai")
        ? new Response(null, { status: 429, headers: { "Retry-After": "60" } })
        : new Response("ok");
    },
    { spacingMs: 0, now: () => time },
  );
  await fetcher(url("1/videos"));
  const next = await fetcher(url("2/full"));
  assert.equal(next.status, 429);
  assert.equal(next.headers.get("Retry-After"), "60");
  assert.equal(calls, 1);
  assert.equal(
    (await fetcher("https://api.myanimelist.net/v2/anime/1")).status,
    200,
  );
  assert.equal(calls, 2);
  time += 61000;
  await fetcher(url("3/pictures"));
  assert.equal(calls, 3);
});
test("queued aborted work never sends a provider request", async () => {
  let calls = 0;
  const release = [];
  const fetcher = createProviderFetch(
    async () => {
      calls++;
      await new Promise((r) => release.push(r));
      return new Response("{}");
    },
    { spacingMs: 0 },
  );
  const a = fetcher(url("1/full")),
    b = fetcher(url("2/full"));
  const controller = new AbortController();
  const c = fetcher(url("3/full"), { signal: controller.signal });
  controller.abort();
  await assert.rejects(c);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls, 2);
  release.forEach((r) => r());
  await Promise.all([a, b]);
});
test("request starts are spaced even when provider responses are immediate", async () => {
  const starts = [];
  const fetcher = createProviderFetch(
    async () => {
      starts.push(performance.now());
      return new Response("{}");
    },
    { spacingMs: 20 },
  );
  await Promise.all([1, 2, 3].map((id) => fetcher(url(`${id}/videos`))));
  assert.ok(starts[1] - starts[0] >= 15);
  assert.ok(starts[2] - starts[1] >= 15);
});
test("a video rate limit does not trigger a second call to the same provider's full endpoint", async () => {
  let calls = 0;
  const service = createTrailerService({
    fetcher: async () => {
      calls++;
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": "45" },
      });
    },
  });
  await assert.rejects(
    service.get(1),
    (error) => error.status === 429 && error.retryAfter === 45,
  );
  assert.equal(calls, 1);
});
