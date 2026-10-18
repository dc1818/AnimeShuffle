import { genreGroups } from "../lib/genres.js";
export function GenreBadges({ anime }) {
  return (
    <div className="genre-groups" aria-label="Anime genres and themes">
      {genreGroups(anime).map(([label, tags]) => (
        <div
          className={`genre-group genre-group-${label.toLowerCase()}`}
          key={label}
        >
          <span className="genre-group-label">{label}</span>
          <div className="genres">
            {tags.map((tag) => (
              <span className="genre" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
