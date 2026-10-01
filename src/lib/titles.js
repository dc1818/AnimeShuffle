/** Keep MAL's main (usually romanized Japanese) title and its supplied translations. */
export function primaryTitle(anime) {
  return anime.originalTitle || anime.title || "";
}
export function englishTitle(anime) {
  // Older saves used the English title as `title`; retain it without inventing a translation.
  const english =
    anime.englishTitle ||
    (anime.originalTitle && anime.originalTitle !== anime.title
      ? anime.title
      : "");
  return english &&
    english.toLocaleLowerCase() !== primaryTitle(anime).toLocaleLowerCase()
    ? english
    : "";
}
export function titleFields(anime) {
  const text = (value) =>
    typeof value === "string" ? value.trim().slice(0, 200) : "";
  return {
    originalTitle: text(anime.originalTitle),
    englishTitle: text(englishTitle(anime)),
    japaneseTitle: text(anime.japaneseTitle),
    synonyms: Array.isArray(anime.synonyms)
      ? anime.synonyms
          .filter((s) => typeof s === "string")
          .slice(0, 20)
          .map(text)
      : [],
  };
}
export function matchesTitle(anime, query) {
  const fold = (value) =>
    (value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[\p{P}\p{Z}]+/gu, " ")
      .trim();
  return [
    anime.title,
    primaryTitle(anime),
    englishTitle(anime),
    anime.japaneseTitle,
    ...(anime.synonyms || []),
  ].some((t) => fold(t).includes(fold(query)));
}
