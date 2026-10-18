/** Keep MAL's canonical names for scoring and saved data; translate only labels. */
export const genreLabel = (genre) =>
  genre === "Avant Garde" ? "Experimental" : genre;
export const canonicalGenre = (genre) =>
  genre === "Experimental" ? "Avant Garde" : genre;

// MAL/Jikan exposes parallel facets, not an official parent-child genre tree.
// Related themes below are navigation suggestions only; never inferred tags.
export const MAIN_GENRES = [
  "Action",
  "Adventure",
  "Avant Garde",
  "Boys Love",
  "Comedy",
  "Drama",
  "Fantasy",
  "Girls Love",
  "Gourmet",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Suspense",
];
export const THEMES = [
  "Adult Cast",
  "Anthropomorphic",
  "CGDCT",
  "Childcare",
  "Combat Sports",
  "Crossdressing",
  "Delinquents",
  "Detective",
  "Educational",
  "Gag Humor",
  "Gore",
  "Harem",
  "High Stakes Game",
  "Historical",
  "Idols (Female)",
  "Idols (Male)",
  "Isekai",
  "Iyashikei",
  "Love Polygon",
  "Love Status Quo",
  "Magical Sex Shift",
  "Mahou Shoujo",
  "Martial Arts",
  "Mecha",
  "Medical",
  "Military",
  "Music",
  "Mythology",
  "Organized Crime",
  "Otaku Culture",
  "Parody",
  "Performing Arts",
  "Pets",
  "Psychological",
  "Racing",
  "Reincarnation",
  "Reverse Harem",
  "Romantic Subtext",
  "Samurai",
  "School",
  "Showbiz",
  "Space",
  "Strategy Game",
  "Super Power",
  "Survival",
  "Team Sports",
  "Time Travel",
  "Vampire",
  "Video Game",
  "Visual Arts",
  "Workplace",
];
export const DEMOGRAPHICS = ["Josei", "Kids", "Seinen", "Shoujo", "Shounen"];
export const RELATED_THEMES = {
  Action: ["Martial Arts", "Samurai", "Super Power", "Military"],
  Comedy: ["Gag Humor", "Parody"],
  Fantasy: ["Isekai", "Reincarnation", "Mahou Shoujo", "Mythology"],
  Mystery: ["Detective", "Psychological"],
  Romance: ["Love Polygon", "Romantic Subtext"],
  "Sci-Fi": ["Mecha", "Space", "Time Travel"],
  "Slice of Life": ["Iyashikei", "School", "Workplace"],
  Sports: ["Team Sports", "Combat Sports", "Racing"],
  Supernatural: ["Vampire", "Mythology"],
};
export function genreGroups(anime) {
  const tags = [
    ...new Set(
      [
        ...(anime.genres || []),
        ...(anime.themes || []),
        ...(anime.demographics || []),
      ]
        .map((g) => canonicalGenre(typeof g === "string" ? g : g.name))
        .filter(Boolean),
    ),
  ];
  const groups = {
    Genres: [],
    Themes: [],
    Audience: [],
    Content: [],
    Other: [],
  };
  for (const tag of tags) {
    const group = MAIN_GENRES.includes(tag)
      ? "Genres"
      : THEMES.includes(tag)
        ? "Themes"
        : DEMOGRAPHICS.includes(tag)
          ? "Audience"
          : ["Ecchi", "Erotica", "Hentai"].includes(tag)
            ? "Content"
            : "Other";
    groups[group].push(genreLabel(tag));
  }
  if (
    (anime.nsfw === "black" || anime.ageRating === "rx") &&
    !groups.Content.length
  )
    groups.Content.push("Explicit");
  return Object.entries(groups).filter(([, values]) => values.length);
}
