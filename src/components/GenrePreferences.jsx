import { TaxonomyPreferences } from "./TaxonomyPreferences.jsx";
import { TAXONOMY_BY_ID } from "../lib/anime-taxonomy.js";
import {
  genreLabel,
  RELATED_THEMES,
  DEMOGRAPHICS,
  CATEGORY_DESCRIPTIONS,
  THEME_GROUPS,
  THEME_DESCRIPTIONS,
} from "../lib/genres.js";
import { GENRES } from "../lib/preferences.js";

/** An empty selection removes the explicit genre filter, keeping learned taste. */
export function GenrePreferences({ value, setValue, disabled }) {
  const selected = value.favoriteGenres || [];
  return (
    <fieldset className="preference-group" disabled={disabled}>
      <legend>Genres and themes</legend>
      <section
        className="main-category-preferences"
        aria-label="Anime audience preferences"
      >
        <h3>Audience · who it was marketed to</h3>
        <p>
          Shounen, Shoujo, Seinen and Josei describe the original intended
          audience, not who can enjoy a title. Choose any combination, or keep
          all categories.
        </p>
        <div className="genre-choices">
          <button
            aria-pressed={!value.requiredCategories?.length}
            onClick={() =>
              setValue((current) => ({ ...current, requiredCategories: [] }))
            }
          >
            Any audience
          </button>
          {DEMOGRAPHICS.map((category) => (
            <button
              key={category}
              title={CATEGORY_DESCRIPTIONS[category]}
              aria-pressed={
                value.requiredCategories?.includes(category) || false
              }
              onClick={() =>
                setValue((current) => ({
                  ...current,
                  requiredCategories: current.requiredCategories?.includes(
                    category,
                  )
                    ? current.requiredCategories.filter((c) => c !== category)
                    : [...(current.requiredCategories || []), category],
                  ...(category === "Kids" &&
                  !current.requiredCategories?.includes(category)
                    ? { childrenTitles: "include" }
                    : {}),
                }))
              }
            >
              {category === "Kids" ? "Kids / Kodomo" : category}
            </button>
          ))}
        </div>
        {(value.requiredCategories || []).map((category) => (
          <p className="category-explanation" key={category}>
            <strong>{category}:</strong> {CATEGORY_DESCRIPTIONS[category]}
          </p>
        ))}
        <p>
          {value.requiredCategories?.length
            ? `Only showing source-labeled ${value.requiredCategories.join(" / ")} anime. Titles without a audience label are excluded.`
            : "All audiences allowed, including titles with no audience label."}{" "}
          Selecting Kids also enables children’s titles.
        </p>
      </section>
      <h3>Genres · type of story</h3>
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
      <TaxonomyPreferences value={value} setValue={setValue} />
      <details className="theme-preferences">
        <summary>
          Catalog themes · additional filters{" "}
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
          {Object.entries(THEME_GROUPS).map(([group, themes]) => (
            <div className="theme-option-group" key={group}>
              <h4>{group}</h4>
              <div className="genre-choices">
                {themes.map((theme) => (
                  <button
                    key={theme}
                    title={THEME_DESCRIPTIONS[theme]}
                    aria-pressed={
                      value.requiredThemes?.includes(theme) || false
                    }
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
            </div>
          ))}
          {(value.requiredThemes || []).map((theme) => (
            <p className="theme-explanation" key={theme}>
              <strong>{theme}:</strong> {THEME_DESCRIPTIONS[theme]}
            </p>
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
  categories = [],
  nodes = [],
  restrictNodes = false,
  onChange,
}) {
  if (
    !genres.length &&
    !themes.length &&
    !categories.length &&
    !nodes.length &&
    !restricted
  )
    return null;
  return (
    <div className="genre-focus" aria-label="Current genre preferences">
      <span>
        {nodes.length > 0 && (
          <>
            {restrictNodes
              ? "Only showing category matches:"
              : "Category interests:"}{" "}
            <strong>
              {nodes
                .map((id) => TAXONOMY_BY_ID.get(id)?.label)
                .filter(Boolean)
                .join(", ")}
            </strong>
            . {restrictNodes && "Matches at least one selected category. "}
          </>
        )}
        {categories.length > 0 && (
          <>
            Audience filter: <strong>{categories.join(", ")}</strong> (matches
            at least one).{" "}
          </>
        )}
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
          Change filters
        </button>
      )}
    </div>
  );
}
