import test from "node:test";
import assert from "node:assert/strict";
import { narrativeFeatures, storyAspects } from "../src/lib/story-aspects.js";
import {
  buildTaste,
  rankRecommendations,
  detailedExplanation,
} from "../src/lib/recommend.js";
const anime = (id, synopsis, extra = {}) => ({
  id,
  title: `Anime ${id}`,
  synopsis,
  genres: ["Action", "Sci-Fi", "Mecha"],
  nsfw: "white",
  format: "tv",
  prequels: [],
  ...extra,
});
const machine =
  "Young pilots control giant robots in combat to defend the city. The pilots operate mobile suits in battles against invading armies.";
const mixed =
  "An empire rules the nation. Rebels resist the oppressive empire. Political schemes and betrayal undermine the government. Pilots control mechs in combat. A criminal organization and its villain mastermind pursue a ruthless plan.";

test("automatic context distinguishes robot combat from broader mecha stories and leaves sparse metadata unknown", () => {
  assert.equal(narrativeFeatures(anime(1, machine)).focus, "central");
  assert.equal(narrativeFeatures(anime(2, mixed)).focus, "mixed");
  assert.equal(narrativeFeatures(anime(3, "")).focus, "unspecified");
  assert.equal(
    narrativeFeatures(
      anime(4, "A child plays with a toy robot.", { genres: ["Adventure"] }),
    ).focus,
    "unspecified",
  );
  const liked = anime(10, mixed),
    disliked = anime(11, machine);
  const reactions = {
    10: { action: "good", anime: liked },
    11: { action: "bad", anime: disliked },
  };
  const candidates = [anime(1, machine), anime(2, mixed)];
  const picks = rankRecommendations(candidates, { reactions });
  assert.equal(picks[0].anime.id, 2);
  const taste = buildTaste(reactions, [], {}, candidates);
  assert.ok(
    taste.model
      .explain(candidates[0])
      .contributions.find((c) => c.key === "mecha:central").contribution < 0,
  );
  assert.match(
    detailedExplanation(candidates[1], taste),
    /mechs work better for you as part of a broader story/,
  );
  const reversed = {
    10: { action: "bad", anime: liked },
    11: { action: "good", anime: disliked },
  };
  assert.equal(
    rankRecommendations(candidates, { reactions: reversed })[0].anime.id,
    1,
  );
});

test("different tastes learn opposite rankings even with identical broad genre tags", () => {
  for (const [one, two] of [
    [
      "A peaceful village offers a gentle everyday life. Friends support one another together.",
      "A sinister presence haunts the town with terrifying encounters. Psychological pressure makes them question reality.",
    ],
    [
      "Their romantic feelings slowly develop over time.",
      "A married couple adjusts to life together and navigates their marriage.",
    ],
    [
      "A villain mastermind pursues a ruthless plan. A rival challenges the hero to surpass his limits.",
      "A chef learns new skills to improve his craft and pursue his career.",
    ],
    [
      "A mentor trains an apprentice to develop her skills.",
      "Allies betray their friends and test their trust.",
    ],
    [
      "An anthology of self-contained stories explores different cases each episode.",
      "Interwoven timelines tell a nonlinear story. A surreal journey unfolds in a dreamlike world.",
    ],
  ]) {
    const liked = anime(10, one, { genres: ["Drama"] }),
      disliked = anime(11, two, { genres: ["Drama"] });
    const candidates = [
      anime(1, one, { genres: ["Drama"] }),
      anime(2, two, { genres: ["Drama"] }),
    ];
    for (const reverse of [false, true]) {
      const reactions = {
        10: { anime: liked, action: reverse ? "bad" : "good" },
        11: { anime: disliked, action: reverse ? "good" : "bad" },
      };
      assert.equal(
        rankRecommendations(candidates, { reactions })[0].anime.id,
        reverse ? 2 : 1,
      );
      const taste = buildTaste(reactions, [], {}, candidates);
      const target = candidates[reverse ? 1 : 0];
      assert.ok(
        taste.model.explain(target).groups.aspect > 0,
        "Narrative dimensions themselves influence ranking",
      );
    }
  }
});

test("planned titles are weaker than likes, never prove enjoyment, and explanations avoid invented motives", () => {
  const trigun = anime(10, "A villain mastermind pursues a ruthless plan.", {
    title: "Trigun",
    genres: ["Action"],
  });
  const candidate = anime(1, trigun.synopsis, { genres: ["Action"] });
  const plan = buildTaste({ 10: { anime: trigun, action: "watch" } }, [], {}, [
    candidate,
  ]);
  const good = buildTaste({ 10: { anime: trigun, action: "good" } }, [], {}, [
    candidate,
  ]);
  assert.equal(plan.records.get(10).enjoyment, 0);
  assert.ok(
    good.model.score(candidate).score > plan.model.score(candidate).score,
  );
  const text = detailedExplanation(candidate, plan);
  assert.match(text, /future watch/);
  assert.doesNotMatch(
    text,
    /You liked Trigun|you enjoyed Trigun|mix you found|favorite villain|Shigaraki|cool artwork/i,
  );
  const strong = detailedExplanation(candidate, good);
  assert.match(strong, /You liked Trigun/);
  assert.match(strong, /adversary whose plans drive the conflict/);
  assert.doesNotMatch(
    strong,
    /your favorite villain|you liked.*because|you enjoyed.*because/i,
  );
});

test("genre labels alone never manufacture aspects or visual/pacing judgments; negated themes aren't positive evidence", () => {
  assert.equal(
    storyAspects(anime(1, "", { genres: ["Action", "Mecha", "Psychological"] }))
      .size,
    0,
  );
  assert.equal(
    storyAspects(
      anime(
        2,
        "There are no villains with ruthless plans. There is no romantic relationship that develops slowly.",
      ),
    ).size,
    0,
  );
  assert.ok(
    storyAspects(
      anime(3, "Without powers, the underdog is determined to become a hero."),
    ).has("underdog"),
  );
});
