import test from "node:test";
import assert from "node:assert/strict";
import { validImage, normalize, createMalClient, fields } from "../lib/mal.mjs";
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });
test("image proxy accepts only MAL cover hosts and paths", () => {
  assert.ok(validImage("https://cdn.myanimelist.net/images/anime/4/19644.jpg"));
  for (const u of [
    "http://localhost/a.jpg",
    "https://cdn.myanimelist.net.evil.com/images/anime/a.jpg",
    "https://user:pw@cdn.myanimelist.net/images/anime/a.jpg",
    "https://cdn.myanimelist.net/elsewhere.jpg",
  ])
    assert.equal(validImage(u), false);
});
test("normalization preserves zero scores and extracts prerequisite IDs", () => {
  const a = normalize({
    id: 1,
    title: "Original",
    alternative_titles: { en: "English" },
    average_episode_duration: 1440,
    related_anime: [
      { relation_type: "prequel", node: { id: 2 } },
      { relation_type: "sequel", node: { id: 3 } },
      { relation_type: "alternative_version", node: { id: 4 } },
    ],
    my_list_status: { score: 0 },
  });
  assert.equal(a.title, "Original");
  assert.equal(a.englishTitle, "English");
  assert.equal(a.duration, 24);
  assert.deepEqual(a.prequels, [2]);
  assert.deepEqual(a.sequels, [3]);
  assert.equal(a.listStatus.score, 0);
});
test("public data caches, personal data never uses public cache", async () => {
  let calls = [];
  const client = createMalClient({
    clientId: "id",
    interval: 0,
    fetcher: async (url, options) => {
      calls.push(options);
      return response({ id: 1 });
    },
  });
  await client.request("/anime/1", { publicCache: true });
  await client.request("/anime/1", { publicCache: true });
  assert.equal(calls.length, 1);
  const session = {
    tokens: { access: "private", expires: Date.now() + 999999 },
  };
  await client.request("/anime/1", { session, publicCache: true });
  await client.request("/anime/1", { session, publicCache: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].headers.Authorization, "Bearer private");
  assert.equal(calls[0].headers["X-MAL-CLIENT-ID"], "id");
});
test("expired access token refreshes before private request", async () => {
  let urls = [];
  const client = createMalClient({
    clientId: "id",
    clientSecret: "secret",
    interval: 0,
    fetcher: async (url, opt) => {
      urls.push(url);
      return url.endsWith("/token")
        ? response({
            access_token: "new",
            refresh_token: "refresh",
            expires_in: 3600,
          })
        : response({ auth: opt.headers.Authorization });
    },
  });
  const s = { tokens: { access: "old", refresh: "r", expires: 0 } };
  const r = await client.request("/users/@me", { session: s });
  assert.equal(r.auth, "Bearer new");
  assert.equal(urls.length, 2);
});
test("401 clears stale authorization and network errors do not expose secrets", async () => {
  const s = { tokens: { access: "private", expires: Date.now() + 999999 } };
  const c = createMalClient({
    clientId: "id",
    interval: 0,
    fetcher: async () => response({}, 401),
  });
  await assert.rejects(c.request("/users/@me", { session: s }), /expired/);
  assert.equal(s.tokens, undefined);
  const n = createMalClient({
    clientId: "id",
    interval: 0,
    fetcher: async () => {
      throw Error("secret");
    },
  });
  await assert.rejects(
    n.request("/anime/1"),
    (e) => !e.message.includes("secret"),
  );
});

test("MAL community scores and content ratings survive normalization without inventing missing scores", () => {
  const a = normalize({
    id: 1,
    title: "Rated",
    mean: 8.71,
    num_scoring_users: 12500,
    rating: "pg_13",
  });
  assert.equal(a.score, 8.71);
  assert.equal(a.scoreVotes, 12500);
  assert.equal(a.ageRating, "pg_13");
  assert.equal(normalize({ id: 2, title: "Unrated" }).score, null);
});

test("token exchange sends form-encoded OAuth and PKCE values to MAL", async () => {
  const client = createMalClient({
    clientId: "fixture-client",
    clientSecret: "fixture-secret",
    fetcher: async (url, options) => {
      assert.equal(url, "https://myanimelist.net/v1/oauth2/token");
      assert.equal(options.method, "POST");
      assert.equal(
        options.headers["Content-Type"],
        "application/x-www-form-urlencoded",
      );
      assert.deepEqual(Object.fromEntries(options.body), {
        client_id: "fixture-client",
        client_secret: "fixture-secret",
        grant_type: "authorization_code",
        code: "fixture-code",
        code_verifier: "fixture-verifier",
        redirect_uri: "https://shuffle.example/auth/callback",
      });
      return response({
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600,
      });
    },
  });
  assert.equal(
    (
      await client.token({
        grant_type: "authorization_code",
        code: "fixture-code",
        code_verifier: "fixture-verifier",
        redirect_uri: "https://shuffle.example/auth/callback",
      })
    ).access,
    "access",
  );
});

test("token failures retain safe categories and upstream status without exposing provider details", async () => {
  for (const [status, body, code] of [
    [
      401,
      { error: "invalid_client", error_description: "PRIVATE" },
      "token_client",
    ],
    [
      400,
      { error: "invalid_grant", error_description: "PRIVATE" },
      "token_grant",
    ],
    [
      400,
      { error: "invalid_request", error_description: "PRIVATE" },
      "token_request",
    ],
    [403, "<html>PRIVATE</html>", "token_forbidden"],
    [429, { error: "PRIVATE" }, "token_rate_limit"],
    [503, { error: "PRIVATE" }, "token_unavailable"],
    [400, { error: "PRIVATE" }, "token_rejected"],
    [200, "PRIVATE invalid json", "token_response"],
  ]) {
    const client = createMalClient({
      clientId: "id",
      clientSecret: "secret",
      fetcher: async () =>
        typeof body === "string"
          ? new Response(body, { status })
          : response(body, status),
    });
    await assert.rejects(client.token({}), (error) => {
      assert.equal(error.code, code);
      assert.ok(!error.message.includes("PRIVATE"));
      assert.ok(!JSON.stringify(error).includes("PRIVATE"));
      if (status !== 200) assert.equal(error.upstreamStatus, status);
      return true;
    });
  }
  const client = createMalClient({
    clientId: "id",
    fetcher: async () => {
      throw Error("PRIVATE");
    },
  });
  await assert.rejects(
    client.token({}),
    (error) =>
      error.code === "token_network" && !error.message.includes("PRIVATE"),
  );
});

test("persistent caching is public-only and coalesces queued duplicate reads", async () => {
  const saved = new Map();
  let calls = 0;
  const c = createMalClient({
    clientId: "id",
    interval: 0,
    publicStore: saved,
    fetcher: async () => {
      calls++;
      return response({ id: 1 });
    },
  });
  await Promise.all([
    c.request("/anime/1", { publicCache: true }),
    c.request("/anime/1", { publicCache: true }),
  ]);
  assert.equal(calls, 1);
  const session = {
    tokens: { access: "private", expires: Date.now() + 999999 },
  };
  await c.request("/users/@me", { session, publicCache: true });
  assert.equal(saved.size, 1);
  assert.equal(saved.has("/users/@me"), false);
});

test("missing synopsis boilerplate is not treated as an anime description", () => {
  const placeholder =
    "No synopsis information has been added to this title. Help improve our database by adding a synopsis";
  assert.equal(
    normalize({ id: 1, title: "Unknown", synopsis: placeholder }).synopsis,
    "",
  );
  assert.equal(
    normalize({
      id: 1,
      title: "Known",
      synopsis: "A detective searches for a missing friend.",
    }).synopsis,
    "A detective searches for a missing friend.",
  );
});

test("catalog hydration reuses only unexpired public details and includes prerequisite exclusions", async () => {
  const entries = new Map();
  let calls = 0;
  const client = createMalClient({
    clientId: "test",
    interval: 0,
    publicStore: {
      get: (key) => entries.get(key),
      set: (key, value) => entries.set(key, value),
    },
    fetcher: async () => {
      calls++;
      return response({
        id: 7,
        title: "Sequel",
        nsfw: "white",
        related_anime: [{ relation_type: "prequel", node: { id: 3 } }],
      });
    },
  });
  const candidate = {
    id: 7,
    title: "Catalog title",
    previewVideoId: "abcdefghijk",
  };
  assert.equal(client.withCachedDetails(candidate), candidate);
  const path = `/anime/7?fields=${encodeURIComponent(fields)}`;
  await client.request(path, { publicCache: true });
  const hydrated = client.withCachedDetails(candidate);
  assert.deepEqual(hydrated.prequels, [3]);
  assert.ok(hydrated.detailsVerifiedUntil > Date.now());
  assert.equal(hydrated.previewVideoId, candidate.previewVideoId);
  assert.equal(hydrated.listStatus, undefined);
  assert.equal(calls, 1);
  entries.get(path).expires = Date.now() - 1;
  assert.equal(client.withCachedDetails(candidate), candidate);
});
