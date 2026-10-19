import { TAXONOMY_BY_ID, taxonomyCardRows } from "../lib/anime-taxonomy.js";
import { genreGroups } from "../lib/genres.js";
export function GenreBadges({ anime }) {
  const rows = taxonomyCardRows(anime);
  const groups = genreGroups(anime);
  // A missing demographic is unknown, never inferred from art, plot or rating.
  if (!groups.some(([label]) => label === "Audience"))
    groups.unshift(["Audience", []]);
  return (
    <div
      className="genre-groups"
      aria-label="Anime audience, genres and themes"
    >
      {groups.map(([label, tags]) => (
        <div
          className={`genre-group genre-group-${label.toLowerCase()}`}
          key={label}
        >
          <span
            className="genre-group-label"
            title={
              label === "Audience"
                ? "Catalog audience label, not an age rating or a restriction on who can enjoy this anime."
                : undefined
            }
          >
            {label}
          </span>
          <div className="genres">
            {label === "Audience" && !tags.length && (
              <span
                className="genre genre-unknown"
                title="The catalog has not supplied an audience label for this anime."
              >
                Not listed
              </span>
            )}
            {tags.map((tag) => (
              <span className="genre" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
      {rows.length > 0 && (
        <details className="taxonomy-card" key={anime.id}>
          <summary>
            Explore this anime’s categories <span>{rows.length}</span>
          </summary>
          <p>
            Known catalog labels and their category paths. Missing labels do not
            mean a theme is absent.
          </p>
          <div className="taxonomy-card-paths">
            {rows.map(({ node, paths, source }) => (
              <div className="taxonomy-card-path" key={node.id}>
                <span className="taxonomy-facet">{node.facet}</span>
                {paths.map((path) => (
                  <span className="taxonomy-path" key={path.join("/")}>
                    {path.map((id, i) => (
                      <span key={id}>
                        {i > 0 && (
                          <span aria-hidden="true" className="taxonomy-arrow">
                            {" "}
                            ›{" "}
                          </span>
                        )}
                        <span
                          className={
                            i === path.length - 1 ? "taxonomy-leaf" : ""
                          }
                        >
                          {TAXONOMY_BY_ID.get(id).label}
                        </span>
                      </span>
                    ))}
                  </span>
                ))}
                {node.definition && (
                  <span className="taxonomy-definition">{node.definition}</span>
                )}
                <small>{source}</small>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
