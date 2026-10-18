/** Keep MAL's canonical names for scoring and saved data; translate only labels. */
export const genreLabel = (genre) =>
  genre === "Avant Garde" ? "Experimental" : genre;
export const canonicalGenre = (genre) =>
  ({
    Experimental: "Avant Garde",
    Shonen: "Shounen",
    Shōnen: "Shounen",
    Shojo: "Shoujo",
    Shōjo: "Shoujo",
    Kodomo: "Kids",
    Kodomomuke: "Kids",
  })[genre] || genre;

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
export const DEMOGRAPHICS = ["Shounen", "Shoujo", "Seinen", "Josei", "Kids"];
export const CATEGORY_DESCRIPTIONS = {
  Shounen:
    "Traditionally marketed to teenage boys; includes action, comedy, romance, sports and more.",
  Shoujo:
    "Traditionally marketed to teenage girls; includes romance, fantasy, adventure, drama and more.",
  Seinen:
    "Traditionally marketed to adult men; ranges from everyday comedy to drama, mystery and more.",
  Josei:
    "Traditionally marketed to adult women; includes relationships, everyday life, drama and more.",
  Kids: "Children-oriented titles, also called Kodomo or Kodomomuke. Not a substitute for age ratings.",
};
// Product navigation groups, not official MAL parent/child assignments.
export const THEME_GROUPS = {
  "Action & competition": [
    "Martial Arts",
    "Samurai",
    "Military",
    "Super Power",
    "Combat Sports",
    "Team Sports",
    "Racing",
    "High Stakes Game",
    "Strategy Game",
  ],
  "Fantasy & science fiction": [
    "Isekai",
    "Reincarnation",
    "Mahou Shoujo",
    "Mythology",
    "Vampire",
    "Mecha",
    "Space",
    "Time Travel",
    "Video Game",
    "Magical Sex Shift",
  ],
  "Mystery & tension": [
    "Detective",
    "Psychological",
    "Organized Crime",
    "Survival",
    "Gore",
  ],
  "Relationships & identity": [
    "Love Polygon",
    "Love Status Quo",
    "Romantic Subtext",
    "Harem",
    "Reverse Harem",
    "Crossdressing",
  ],
  "Everyday life & cast": [
    "Adult Cast",
    "School",
    "Workplace",
    "Childcare",
    "Pets",
    "CGDCT",
    "Delinquents",
    "Anthropomorphic",
    "Iyashikei",
  ],
  "Arts & entertainment": [
    "Music",
    "Performing Arts",
    "Visual Arts",
    "Showbiz",
    "Idols (Female)",
    "Idols (Male)",
    "Otaku Culture",
  ],
  "Comedy styles": ["Gag Humor", "Parody"],
  "History & learning": ["Historical", "Educational", "Medical"],
};
export const THEME_DESCRIPTIONS = {
  "Adult Cast": "Primarily adult characters.",
  Anthropomorphic: "Human-like animal or nonhuman characters.",
  CGDCT: "Cute girls doing cute things; everyday group activities.",
  Childcare: "Raising or caring for children.",
  "Combat Sports": "Organized competitive fighting sports.",
  Crossdressing: "Characters dressing across conventional gender expectations.",
  Delinquents: "Rebellious youth or delinquent groups.",
  Detective: "Investigators solving cases.",
  Educational: "Designed to teach topics or skills.",
  "Gag Humor": "Jokes and comic situations are a defining focus.",
  Gore: "Graphic injury or violence; a content consideration.",
  Harem: "Multiple potential female romantic interests around a protagonist.",
  "High Stakes Game": "Games or contests with serious consequences.",
  Historical: "A historical setting or period.",
  "Idols (Female)": "Female idol performers and their industry.",
  "Idols (Male)": "Male idol performers and their industry.",
  Isekai: "A character enters or lives in another world.",
  Iyashikei: "A soothing, restorative atmosphere.",
  "Love Polygon": "Interconnected romantic interests among several characters.",
  "Love Status Quo":
    "Romantic relationships remain largely unresolved or unchanged.",
  "Magical Sex Shift":
    "A fantastical change of a character’s sex or physical gender presentation.",
  "Mahou Shoujo": "Magical girls and their transformations or adventures.",
  "Martial Arts": "Fighting disciplines and techniques.",
  Mecha: "Robots or mechanical vehicles are an identifiable theme.",
  Medical: "Medicine, healthcare or medical professionals.",
  Military: "Armed forces or military life.",
  Music: "Music or musicians as a theme.",
  Mythology: "Myths, legends or folklore.",
  "Organized Crime": "Criminal organizations and their activities.",
  "Otaku Culture": "Dedicated anime, manga, gaming or related fan culture.",
  Parody: "Comic imitation of other works or conventions.",
  "Performing Arts": "Stage performance, acting, dance or related arts.",
  Pets: "Companion animals and their relationships with people.",
  Psychological: "Mental states, perception or psychological conflict.",
  Racing: "Speed-based competitions.",
  Reincarnation: "Rebirth into another life.",
  "Reverse Harem":
    "Multiple potential male romantic interests around a protagonist.",
  "Romantic Subtext": "Romantic implications without romance as a main genre.",
  Samurai: "Samurai characters, traditions or conflicts.",
  School: "School life or a school setting.",
  Showbiz: "The entertainment industry.",
  Space: "Outer space settings or travel.",
  "Strategy Game": "Strategic games or structured tactical competition.",
  "Super Power": "Extraordinary abilities.",
  Survival: "Struggling to survive dangerous conditions.",
  "Team Sports": "Organized sports played by teams.",
  "Time Travel": "Travel or communication across time.",
  Vampire: "Vampires as a theme.",
  "Video Game": "Video games or game worlds.",
  "Visual Arts": "Drawing, painting, design or other visual arts.",
  Workplace: "Working life or a professional setting.",
};
export function animeTags(anime) {
  return [
    ...new Set(
      [
        ...(anime?.genres || []),
        ...(anime?.themes || []),
        ...(anime?.demographics || []),
      ]
        .map((g) => canonicalGenre(typeof g === "string" ? g : g?.name))
        .filter(Boolean),
    ),
  ];
}
// Small source-tag interactions can distinguish Shounen + Sports from Shounen + Romance.
export function categoryContextFeatures(anime) {
  const tags = animeTags(anime),
    categories = tags.filter((t) => DEMOGRAPHICS.includes(t)).slice(0, 2);
  const genres = tags.filter((t) => MAIN_GENRES.includes(t)).slice(0, 4);
  const themes = tags.filter((t) => THEMES.includes(t)).slice(0, 4);
  return categories.flatMap((c) => [
    ...genres.map((g) => [
      `category-genre:${c}|${g}`,
      0.25 / Math.sqrt(Math.max(1, categories.length * genres.length)),
    ]),
    ...themes.map((t) => [
      `category-theme:${c}|${t}`,
      0.2 / Math.sqrt(Math.max(1, categories.length * themes.length)),
    ]),
  ]);
}
export const RELATED_THEMES = {
  Action: ["Martial Arts", "Samurai", "Super Power", "Military"],
  Adventure: ["Isekai", "Space", "Survival", "Historical"],
  "Avant Garde": ["Psychological"],
  "Boys Love": ["Adult Cast", "School", "Workplace"],
  "Girls Love": ["Adult Cast", "School", "Workplace"],
  Drama: ["Adult Cast", "Childcare", "Medical", "Performing Arts"],
  Gourmet: ["Workplace", "Iyashikei"],
  Horror: ["Gore", "Vampire", "Survival", "Psychological"],
  Suspense: ["Detective", "Organized Crime", "Survival", "High Stakes Game"],
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
  const tags = animeTags(anime);
  const groups = {
    Audience: [],
    Genres: [],
    Themes: [],
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
