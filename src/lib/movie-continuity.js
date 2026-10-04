/**
 * MAL has no canon flag. Only explicit statements about this film count;
 * original scripts, side-story relations and missing manga links prove nothing.
 * Unknown is intentionally allowed, rather than silently hiding canon films.
 * Keep evidence out of user-facing explanations to avoid background spoilers.
 */
export function movieContinuity(anime) {
  if ((anime.format || anime.media_type) !== "movie") return "unknown";
  const titles = [anime.title, anime.englishTitle, anime.alternative_titles?.en]
    .filter((title) => typeof title === "string" && title.length > 2)
    .map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const subject = ["(?:this|the) (?:movie|film)", ...titles].join("|");
  const assertion = new RegExp(
    `^(?:${subject})\\s+(?:is|has been confirmed to be)\\s+(?:(?:an?|explicitly|officially)\\s+)?(?:non[- ]canon(?:ical)?\\b|not (?:considered )?canon(?:ical)?\\b|outside (?:the|its) (?:main|main story) continuity\\b)`,
    "i",
  );
  const text = [anime.background, anime.synopsis]
    .filter((s) => typeof s === "string")
    .join("\n");
  // Changes in continuity and qualified/disputed claims need editorial review.
  if (
    /\b(?:now|later) (?:considered |made |confirmed )?canon(?:ical)?\b/i.test(
      text,
    )
  )
    return "unknown";
  return text
    .split(/(?:[.!?]\s+|\n+)/)
    .some(
      (sentence) =>
        assertion.test(sentence.trim()) &&
        !/\b(?:possibly|arguably|disputed|debatable|however|but)\b/i.test(
          sentence,
        ),
    )
    ? "non_canon"
    : "unknown";
}

export function isNonCanonMovie(anime) {
  return (
    anime?.format === "movie" &&
    (anime.continuity === "non_canon" || movieContinuity(anime) === "non_canon")
  );
}
