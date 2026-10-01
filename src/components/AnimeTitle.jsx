import { primaryTitle, englishTitle } from "../lib/titles.js";
/** Reused in cards, lists and search results so translations stay consistent. */
export function AnimeTitle({ anime }) {
  const english = englishTitle(anime);
  return (
    <>
      <span>{primaryTitle(anime)}</span>
      {english && <span className="english-title">{english}</span>}
    </>
  );
}
