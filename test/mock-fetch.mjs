// Test-only in-memory MAL double. Never imported by the normal app.
let entries = new Map([
  [
    2,
    {
      status: "watching",
      score: 0,
      num_episodes_watched: 3,
      updated_at: "old",
    },
  ],
]);
globalThis.fetch = async (raw, opt = {}) => {
  const u = new URL(raw),
    id = Number(u.pathname.split("/")[3]);
  const reply = (d, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(d), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  if (u.pathname.endsWith("/token"))
    return reply({
      access_token: "TEST_PRIVATE_ACCESS",
      refresh_token: "TEST_PRIVATE_REFRESH",
      expires_in: 3600,
    });
  if (u.pathname === "/v2/users/@me")
    return reply({ id: 7, name: "Test viewer" });
  if (u.pathname.endsWith("/my_list_status")) {
    if (opt.method === "PUT") {
      const entry = {
        status: "plan_to_watch",
        updated_at: "added",
        score: 0,
        num_episodes_watched: 0,
      };
      entries.set(id, entry);
      return reply(entry);
    }
    if (opt.method === "DELETE") {
      entries.delete(id);
      return reply(null, 204);
    }
  }
  if (u.pathname.startsWith("/v2/anime/")) {
    if (id === 3 && entries.has(id))
      entries.set(id, {
        ...entries.get(id),
        updated_at: "externally-edited",
        score: 8,
      });
    return reply({
      id,
      title: "Fixture",
      nsfw: "white",
      my_list_status: entries.get(id),
    });
  }
  return reply({ data: [] });
};
