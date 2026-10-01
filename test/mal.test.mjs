import test from "node:test";
import assert from "node:assert/strict";
import { validImage, normalize, createMalClient } from "../lib/mal.mjs";
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
    related_anime: [{ relation_type: "prequel", node: { id: 2 } }],
    my_list_status: { score: 0 },
  });
  assert.equal(a.title, "English");
  assert.equal(a.duration, 24);
  assert.deepEqual(a.prequels, [2]);
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
