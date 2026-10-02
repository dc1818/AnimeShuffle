import { GENRES } from "../lib/preferences.js";

/** An empty selection removes the explicit genre filter, keeping learned taste. */
export function GenrePreferences({ value, setValue, disabled }) {
  const selected = value.favoriteGenres || [];
  return (
    <fieldset className="preference-group" disabled={disabled}>
      <legend>What genres do you like?</legend>
      <p>Show anime from any of these genres, or choose Any genre.</p>
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
            {genre}
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
        Only showing anime in: <strong>{genres.join(", ")}</strong>, based on
        your viewing preferences.
      </span>
      {onChange && (
        <button className="genre-change" onClick={onChange}>
          Change genres
        </button>
      )}
    </div>
  );
}
