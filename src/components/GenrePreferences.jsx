import { genreLabel } from "../lib/genres.js";
import { GENRES } from "../lib/preferences.js";

/** An empty selection removes the explicit genre filter, keeping learned taste. */
export function GenrePreferences({ value, setValue, disabled }) {
  const selected = value.favoriteGenres || [];
  return (
    <fieldset className="preference-group" disabled={disabled}>
      <legend>What genres do you like?</legend>
      <p>
        This filters Discover and Recommendations: only anime matching at least
        one selected genre will appear. Choose Any genre to remove the
        restriction.
      </p>
      {selected.length > 0 && (
        <p className="genre-focus" role="status">
          <span>
            Only <strong>{selected.map(genreLabel).join(", ")}</strong> anime
            will appear in new picks with these preferences.
          </span>
        </p>
      )}
      <div className="genre-choices">
        <button
          className="any-choice"
          aria-pressed={!selected.length}
          onClick={() =>
            setValue((current) => ({ ...current, favoriteGenres: [] }))
          }
        >
          Any genre
        </button>
        {GENRES.map((genre) => (
          <button
            key={genre}
            className="quiet"
            aria-pressed={selected.includes(genre)}
            onClick={() =>
              setValue((current) => ({
                ...current,
                favoriteGenres: current.favoriteGenres.includes(genre)
                  ? current.favoriteGenres.filter((g) => g !== genre)
                  : [...current.favoriteGenres, genre],
              }))
            }
          >
            {genreLabel(genre)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function GenreFocus({ genres = [], onChange }) {
  if (!genres.length) return null;
  return (
    <div className="genre-focus" aria-label="Current genre preferences">
      <span>
        Only showing anime in:{" "}
        <strong>{genres.map(genreLabel).join(", ")}</strong>, based on your
        viewing preferences.
      </span>
      {onChange && (
        <button className="genre-change" onClick={onChange}>
          Change genres
        </button>
      )}
    </div>
  );
}
