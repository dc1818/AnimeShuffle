import { genreLabel, THEMES, RELATED_THEMES } from "../lib/genres.js";
import { GENRES } from "../lib/preferences.js";

/** An empty selection removes the explicit genre filter, keeping learned taste. */
export function GenrePreferences({ value, setValue, disabled }) {
  const selected = value.favoriteGenres || [];
  return (
    <fieldset className="preference-group" disabled={disabled}>
      <legend>Genres and themes</legend>
      <p>
        Favorites guide your picks while leaving room for discoveries outside
        those genres. Turn on the restriction below only if you want a filter.
      </p>
      {selected.length > 0 && (
        <p className="genre-focus" role="status">
          <span>
            Favorites: <strong>{selected.map(genreLabel).join(", ")}</strong>.
            {value.restrictGenres
              ? " Only showing anime matching at least one selected genre."
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
        Only show anime from my selected genres
      </label>
      {value.restrictGenres && !selected.length && (
        <p role="status">
          Select at least one genre to enable this restriction. All genres are
          currently allowed.
        </p>
      )}
      <p>
        With this restriction on, each anime must have at least one selected
        genre. It may also have additional genres.
      </p>
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
      <details className="theme-preferences">
        <summary>
          Filter by themes / subcategories{" "}
          {value.requiredThemes?.length
            ? `(${value.requiredThemes.length} selected)`
            : "(optional)"}
        </summary>
        <p>
          Themes can belong to multiple genres. These are source tags, not
          guaranteed subgenres. A selected theme is an additional filter: anime
          must match at least one.
        </p>
        {selected
          .filter((g) => RELATED_THEMES[g])
          .map((g) => (
            <p key={g}>
              <strong>{genreLabel(g)} — related themes:</strong>{" "}
              {RELATED_THEMES[g].join(", ")}
            </p>
          ))}
        <div className="genre-choices">
          <button
            aria-pressed={!value.requiredThemes?.length}
            onClick={() =>
              setValue((current) => ({ ...current, requiredThemes: [] }))
            }
          >
            Any theme
          </button>
          {THEMES.map((theme) => (
            <button
              key={theme}
              aria-pressed={value.requiredThemes?.includes(theme) || false}
              onClick={() =>
                setValue((current) => ({
                  ...current,
                  requiredThemes: current.requiredThemes?.includes(theme)
                    ? current.requiredThemes.filter((t) => t !== theme)
                    : [...(current.requiredThemes || []), theme],
                }))
              }
            >
              {theme}
            </button>
          ))}
        </div>
      </details>
    </fieldset>
  );
}

export function GenreFocus({
  genres = [],
  restricted = false,
  themes = [],
  onChange,
}) {
  if (!genres.length && !themes.length && !restricted) return null;
  return (
    <div className="genre-focus" aria-label="Current genre preferences">
      <span>
        {genres.length ? (
          <>
            {restricted
              ? "Only showing anime from:"
              : "Favorite genres (other genres may appear):"}{" "}
            <strong>{genres.map(genreLabel).join(", ")}</strong>.
            {restricted &&
              " Each anime matches at least one; additional genres may also be present."}
          </>
        ) : restricted ? (
          "All genres allowed — select a genre to restrict picks."
        ) : null}
        {themes.length > 0 && (
          <>
            {" "}
            Theme filter: <strong>{themes.join(", ")}</strong> (matches at least
            one).
          </>
        )}
      </span>
      {onChange && (
        <button className="genre-change" onClick={onChange}>
          Change genres
        </button>
      )}
    </div>
  );
}
