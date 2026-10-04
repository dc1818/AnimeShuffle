/** Keep MAL's canonical names for scoring and saved data; translate only labels. */
export const genreLabel = (genre) =>
  genre === "Avant Garde" ? "Experimental" : genre;
export const canonicalGenre = (genre) =>
  genre === "Experimental" ? "Avant Garde" : genre;
