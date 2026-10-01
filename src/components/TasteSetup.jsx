import { useEffect, useState } from "react";
import { GENRES } from "../lib/preferences.js";
import { coverUrl } from "./AnimeCard.jsx";

/** Debounce MAL searches and discard late responses when the query changes. */
export function TasteSetup({ value, setValue, store, disabled, preview }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(-1);
  useEffect(() => {
    let cancelled = false;
    setResults([]);
    setActive(-1);
    if (!open || query.trim().length < 2) {
      setMessage("");
      return;
    }
    setMessage("Searching…");
    const timer = setTimeout(async () => {
      try {
        const found = await store.searchAnime(query);
        if (cancelled) return;
        const available = found.filter(
          (a) =>
            a.status !== "not_yet_aired" &&
            !value.favoriteAnime.some((f) => f.id === a.id),
        );
        setResults(available);
        setMessage(available.length ? "" : "No matches. Try another title.");
      } catch (error) {
        if (!cancelled)
          setMessage(
            error.message ||
              "Search unavailable. Try again or continue without favorites.",
          );
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, store, value.favoriteAnime]);
  function choose(anime) {
    if (disabled || value.favoriteAnime.length >= 3) return;
    setValue((p) => ({ ...p, favoriteAnime: [...p.favoriteAnime, anime] }));
    setQuery(anime.title);
    setOpen(false);
  }
  return (
    <fieldset className="preference-group taste-setup" disabled={disabled}>
      <legend>What genres do you like?</legend>
      <p>These guide your taste without hiding other genres.</p>
      <div className="genre-choices">
        {GENRES.map((genre) => (
          <button
            key={genre}
            className="quiet"
            aria-pressed={value.favoriteGenres.includes(genre)}
            onClick={() =>
              setValue((p) => ({
                ...p,
                favoriteGenres: p.favoriteGenres.includes(genre)
                  ? p.favoriteGenres.filter((g) => g !== genre)
                  : [...p.favoriteGenres, genre],
              }))
            }
          >
            {genre}
          </button>
        ))}
      </div>
      <label htmlFor="favorite-search">
        <strong>
          Pick three anime you like ({value.favoriteAnime.length}/3)
        </strong>
      </label>
      <p>
        A few favorites help us find your first picks. You can also start
        without them and teach us in Discover.
      </p>
      {preview && (
        <small>
          Preview search uses the demo catalog. The hosted app searches
          MyAnimeList.
        </small>
      )}
      <input
        id="favorite-search"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && results.length > 0}
        aria-controls="favorite-results"
        aria-activedescendant={
          active >= 0 && open ? `favorite-result-${active}` : undefined
        }
        autoComplete="off"
        placeholder={
          value.favoriteAnime.length === 3
            ? "Three favorites selected"
            : "Search an anime title…"
        }
        disabled={disabled || value.favoriteAnime.length >= 3}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown" && results.length) {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          }
          if (e.key === "ArrowUp" && results.length) {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          }
          if (e.key === "Enter" && open && active >= 0) {
            e.preventDefault();
            choose(results[active]);
          }
        }}
      />
      {open && (
        <>
          <p role="status">{message}</p>
          <ul
            className="favorite-results"
            id="favorite-results"
            role="listbox"
            aria-label="Anime search results"
          >
            {results.map((a, i) => (
              <li
                key={a.id}
                id={`favorite-result-${i}`}
                role="option"
                aria-selected={active === i}
              >
                <button type="button" onClick={() => choose(a)}>
                  <img src={coverUrl(a)} alt="" />
                  <span>
                    <strong>{a.title}</strong>
                    <small>{a.genres?.join(" · ")}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="favorite-selections">
        {value.favoriteAnime.map((a) => (
          <div key={a.id}>
            <img src={coverUrl(a)} alt="" />
            <span>{a.title}</span>
            <button
              className="quiet"
              aria-label={`Remove favorite ${a.title}`}
              onClick={() => {
                setValue((p) => ({
                  ...p,
                  favoriteAnime: p.favoriteAnime.filter((f) => f.id !== a.id),
                }));
                setQuery("");
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
