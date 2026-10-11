import { genreLabel } from "../lib/genres.js";
import { GENRES } from "../lib/preferences.js";

/** An empty selection removes the explicit genre filter, keeping learned taste. */
export function GenrePreferences({ value, setValue, disabled }) {
  const selected = value.favoriteGenres || [];
  return (
    <fieldset className="preference-group" disabled={disabled}>
      <legend>What genres do you like?</legend>
      <p>
        Favorites guide your picks while leaving room for discoveries outside
        those genres. Turn on the restriction below only if you want a filter.
      </p>
      {selected.length > 0 && (
        <p className="genre-focus" role="status">
          <span>
            Favorites: <strong>{selected.map(genreLabel).join(", ")}</strong>.
            {value.restrictGenres
              ? " New picks must match at least one."
              : " Other genres can still appear."}
          </span>
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={value.restrictGenres === true}
          onChange={(e) =>
            setValue((current) => ({
              ...current,
              restrictGenres: e.target.checked,
            }))
          }
        />
        Only recommend my selected genres
      </label>
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
        Favorite genres: <strong>{genres.map(genreLabel).join(", ")}</strong>,
        based on your viewing preferences.
      </span>
      {onChange && (
        <button className="genre-change" onClick={onChange}>
          Change genres
        </button>
      )}
    </div>
  );
}
