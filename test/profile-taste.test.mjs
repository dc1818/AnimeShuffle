import test from "node:test";
import assert from "node:assert/strict";
import { profileTaste } from "../src/lib/profile-taste.js";
const anime = (id) => ({
  id,
  title: `Anime ${id}`,
  synopsis:
    "Strategic battles and mind games define this story. An ensemble cast explores a world with detailed worldbuilding.",
  genres: [],
});
const state = { preferences: {}, list: [], reactions: {} };
test("profile separates prospective interest from enjoyment and uses fixed spoiler-safe labels", () => {
  const reactions = Object.fromEntries(
    [1, 2].map((id) => [id, { anime: anime(id), action: "watch" }]),
  );
  const curious = profileTaste({ ...state, reactions });
  assert.equal(curious.interests.length, 0);
  assert.ok(curious.curious.length);
  reactions[1].action = "good";
  reactions[2].action = "good";
  const liked = profileTaste({ ...state, reactions });
  assert.ok(liked.interests.length);
  assert.ok(liked.edges.length);
  assert.equal(liked.interests[0].liked[0].evidence, "Marked Good");
  assert.ok(
    !JSON.stringify(liked.interests.map((g) => g.label)).includes(
      "define this story",
    ),
  );
});
test("unrated MAL completions do not establish favorites; personal ratings and explicit negatives do", () => {
  let list = [1, 2].map((id) => ({
    ...anime(id),
    listStatus: { status: "completed", score: 0 },
  }));
  assert.equal(profileTaste({ ...state, list }).interests.length, 0);
  list = list.map((a) => ({
    ...a,
    listStatus: { status: "completed", score: 9 },
  }));
  assert.ok(profileTaste({ ...state, list }).interests.length);
  const reactions = Object.fromEntries(
    [3, 4].map((id) => [id, { anime: anime(id), action: "bad" }]),
  );
  const taste = profileTaste({ ...state, list, reactions });
  assert.equal(taste.interests.length, 0);
  assert.ok(taste.contrasts.length);
  assert.equal(taste.contrasts[0].disliked[0].evidence, "Marked Bad");
});
