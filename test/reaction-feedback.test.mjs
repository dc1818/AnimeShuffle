import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFeedback,
  feedbackExamples,
  FEEDBACK_ASPECTS,
} from "../src/lib/reaction-feedback.js";
import { buildTaste } from "../src/lib/recommend.js";
import { createAnimeStore } from "../src/lib/store.js";

test("feedback validates axis, deduplicates, caps input and preserves notes only as text", () => {
  const value = {
    aspects: [
      { key: "animation", sentiment: "liked" },
      { key: "animation", sentiment: "disliked" },
      { key: "villain", sentiment: "liked" },
      { key: "fake", sentiment: "liked" },
    ],
    note: "x".repeat(600),
  };
  const good = normalizeFeedback(value, "good");
  assert.deepEqual(good.aspects, [
    { key: "animation", sentiment: "disliked" },
    { key: "villain", sentiment: "liked" },
  ]);
  assert.equal(good.note.length, 500);
  assert.deepEqual(normalizeFeedback(value, "watch").aspects, []);
  assert.equal(
    normalizeFeedback(
      {
        aspects: FEEDBACK_ASPECTS.map((a) => ({
          key: a.key,
          sentiment: "liked",
        })),
      },
      "good",
    ).aspects.length,
    12,
  );
});
test("mixed opinions train only supported features on the correct axis; prose and missing evidence add no labels", () => {
  const features = [
    ["review:animation-execution", 1],
    ["nuance:villain-motivation", 1],
    ["text:animation", 1],
    ["genre:Action", 1],
  ];
  const feedback = {
    aspects: [
      { key: "animation", sentiment: "disliked" },
      { key: "villain", sentiment: "liked" },
    ],
    note: "I hate romance",
  };
  const examples = feedbackExamples(features, feedback, "good");
  assert.equal(examples.length, 2);
  assert.equal(examples[0].enjoyment, -0.3);
  assert.equal(examples[1].enjoyment, 0.3);
  assert.equal(examples[0].interest, 0);
  assert.deepEqual(examples[0].features, [features[0]]);
  assert.deepEqual(feedbackExamples([features[2]], feedback, "good"), []);
  const interest = feedbackExamples(
    features,
    { aspects: [{ key: "genre", sentiment: "liked" }] },
    "watch",
  );
  assert.equal(interest[0].enjoyment, 0);
  assert.equal(interest[0].interest, 0.6);
});
test("taste model retains feedback separately from the overall vote", () => {
  const anime = { id: 1, title: "Example", genres: ["Action"] };
  const taste = buildTaste({
    1: {
      anime,
      action: "good",
      feedback: { aspects: [{ key: "animation", sentiment: "disliked" }] },
    },
  });
  assert.equal(taste.records.get(1).enjoyment, 1);
  assert.equal(taste.records.get(1).feedback.aspects[0].sentiment, "disliked");
});
test("feedback survives a guest reload and does not invalidate Undo", async () => {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k),
    setItem: (k, v) => data.set(k, v),
  };
  const store = createAnimeStore({
    storage,
    browserBackup: null,
    staticMode: true,
  });
  await store.initialize();
  await store.savePreferences({});
  const id = store.getSnapshot().current.id;
  await store.react("good");
  await store.setReactionFeedback(id, {
    aspects: [
      { key: "villain", sentiment: "liked" },
      { key: "animation", sentiment: "disliked" },
    ],
    note: "Mixed feelings.",
    customReasons: ["The quiet moments between battles"],
  });
  assert.equal(store.getSnapshot().reactions[id].feedback.aspects.length, 2);
  const reloaded = createAnimeStore({
    storage,
    browserBackup: null,
    staticMode: true,
  });
  await reloaded.initialize();
  assert.equal(
    reloaded.getSnapshot().reactions[id].feedback.note,
    "Mixed feelings.",
  );
  assert.deepEqual(
    reloaded.getSnapshot().reactions[id].feedback.customReasons,
    ["The quiet moments between battles"],
  );
  await store.undo();
  assert.equal(store.getSnapshot().reactions[id], undefined);
});

test("custom reasons are bounded, deduplicated and never treated as catalog facts", () => {
  const feedback = normalizeFeedback(
    {
      customReasons: [
        "  One   reason ",
        "one reason",
        "",
        42,
        "x".repeat(500),
        "<img src=x onerror=alert(1)>",
      ],
    },
    "good",
  );
  assert.equal(feedback.customReasons.length, 3);
  assert.equal(feedback.customReasons[0], "One reason");
  assert.equal(feedback.customReasons[1].length, 200);
  assert.deepEqual(
    feedbackExamples([["genre:Action", 1]], feedback, "good"),
    [],
  );
  const bounded = normalizeFeedback(
    {
      aspects: [{ key: "animation", sentiment: "liked" }],
      customReasons: Array.from({ length: 20 }, (_, i) => `Reason ${i}`),
    },
    "good",
  );
  assert.equal(bounded.aspects.length + bounded.customReasons.length, 12);
});
