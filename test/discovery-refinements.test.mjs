import test from "node:test";
import assert from "node:assert/strict";
import { supportsBackgroundMotion } from "../src/lib/background-performance.js";
import { genreGroups } from "../src/lib/genres.js";
import {
  matchesPreferences,
  normalizePreferences,
} from "../src/lib/preferences.js";
import { eligibleCandidates } from "../src/lib/recommend.js";
import { explicitAvoidancePenalty } from "../src/lib/content-avoidance.js";

test("background requires a verified accelerated renderer and releases its probe", () => {
  for (const [renderer, expected] of [
    ["ANGLE NVIDIA", true],
    ["Google SwiftShader", false],
    ["llvmpipe", false],
    ["", false],
  ]) {
    let released = false;
    const doc = {
      createElement: () => ({
        getContext: (type, options) => {
          assert.equal(options.failIfMajorPerformanceCaveat, true);
          return {
            getParameter: () => renderer,
            getExtension: (name) =>
              name === "WEBGL_debug_renderer_info"
                ? { UNMASKED_RENDERER_WEBGL: 1 }
                : {
                    loseContext: () => {
                      released = true;
                    },
                  },
          };
        },
      }),
    };
    assert.equal(supportsBackgroundMotion(doc), expected);
    assert.equal(released, true);
  }
  assert.equal(
    supportsBackgroundMotion({
      createElement: () => ({ getContext: () => null }),
    }),
    false,
  );
  assert.equal(
    supportsBackgroundMotion({
      createElement: () => {
        throw Error("Blocked");
      },
    }),
    false,
  );
});
test("genre labels preserve facets without inferring parent genres; theme filters combine with genre restriction", () => {
  const anime = {
    genres: ["Action", "Mecha", "Shounen"],
    nsfw: "white",
    format: "tv",
    episodes: 12,
  };
  assert.deepEqual(genreGroups(anime), [
    ["Audience", ["Shounen"]],
    ["Genres", ["Action"]],
    ["Themes", ["Mecha"]],
  ]);
  assert.equal(
    matchesPreferences(anime, {
      favoriteGenres: ["Action", "Fantasy"],
      restrictGenres: true,
      requiredThemes: ["Mecha"],
    }),
    true,
  );
  assert.equal(
    eligibleCandidates([anime], {
      preferences: {
        favoriteGenres: ["Fantasy"],
        restrictGenres: true,
        requiredThemes: ["Mecha"],
      },
    }).length,
    0,
  );
  assert.equal(matchesPreferences(anime, { requiredThemes: ["Space"] }), false);
  assert.deepEqual(
    normalizePreferences({ requiredThemes: ["Mecha", "invented", "Mecha"] })
      .requiredThemes,
    ["Mecha"],
  );
});
test("explicit content receives stronger suppression after repeated rejection, without affecting other titles", () => {
  const adult = { genres: ["Hentai"] };
  const rejected = {
    1: { anime: adult, action: "nope" },
    2: { anime: adult, action: "bad" },
  };
  assert.ok(
    explicitAvoidancePenalty(adult, rejected) >
      explicitAvoidancePenalty(adult, {}),
  );
  assert.equal(explicitAvoidancePenalty({ genres: ["Action"] }, rejected), 0);
  assert.equal(
    explicitAvoidancePenalty(adult, { 1: { anime: adult, action: "good" } }),
    explicitAvoidancePenalty(adult, {}),
  );
});
