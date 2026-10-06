import { MalWatchlistOption } from "./MalWatchlistOption.jsx";
import { useEffect, useRef, useState } from "react";
import { GenrePreferences } from "./GenrePreferences.jsx";
import { TasteSetup } from "./TasteSetup.jsx";
import {
  FORMAT_OPTIONS,
  LENGTH_OPTIONS,
  defaultPreferences,
} from "../lib/preferences.js";

/** Passwords exist only in this form until submitted to the same-origin server. */
export function AccountForm({ mode, store, onNavigate, onComplete }) {
  const registering = mode === "register";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (registering && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const onboarded = await store.authenticate(mode, username, password);
      setPassword("");
      setConfirmPassword("");
      if (onboarded) onComplete();
      else onNavigate("preferences");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <span className="eyebrow">Anime Shuffle account</span>
      <h2>{registering ? "Make yourself at home." : "Welcome back."}</h2>
      <p>
        {registering
          ? "Create an account here, without a MyAnimeList account. You can connect MAL later."
          : "Sign in with your Anime Shuffle username and password."}
      </p>
      <form className="account-form" onSubmit={submit}>
        <label htmlFor="account-username">Username</label>
        <input
          id="account-username"
          name="username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={24}
          pattern="[a-zA-Z0-9_]+"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={pending}
        />
        {registering && <small>3–24 letters, numbers or underscores.</small>}
        <label htmlFor="account-password">Password</label>
        <input
          id="account-password"
          name="password"
          type="password"
          autoComplete={registering ? "new-password" : "current-password"}
          required
          minLength={registering ? 12 : 1}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
        />
        {registering && (
          <>
            <small>
              At least 12 characters. A few memorable words work well.
            </small>
            <label htmlFor="account-confirm">Confirm password</label>
            <input
              id="account-confirm"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={pending}
            />
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={pending}>
          {pending
            ? "Please wait…"
            : registering
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
      <button
        className="quiet"
        disabled={pending}
        onClick={() => onNavigate(registering ? "login" : "register")}
      >
        {registering
          ? "Already have an Anime Shuffle account? Sign in"
          : "Create an Anime Shuffle account"}
      </button>
      <p className="account-note">
        Use the same account on each device to sync on the Cloudflare website.
        Email-based password recovery is not available yet.
      </p>
    </>
  );
}

/** Empty selections mean “any”; multiple choices are ORed within each category. */
export function ViewingPreferences({ state, store, onComplete }) {
  // Returning accounts only edit feed filters here; keep their learned taste
  // and the separate Settings auto-add choice intact.
  const initialSetup = !state.onboardingComplete;
  const showTasteSetup =
    initialSetup || !(state.session.account || state.session.connected);
  const [value, updateValue] = useState(state.preferences);
  const valueRef = useRef(value);
  const saving = useRef(false);
  const [saved, setSaved] = useState(false);
  const saveVersion = useRef(0);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(timer);
  }, [saved]);
  const [hasChosen, setHasChosen] = useState(() => {
    const p = state.preferences;
    return Boolean(
      p.favoriteGenres.length ||
      p.favoriteAnime.length ||
      p.formats.length ||
      p.lengths.length ||
      p.scoreMin != null ||
      p.scoreMax != null ||
      p.finishedOnly ||
      p.includeNonCanonMovies ||
      !p.includeUnknown ||
      (p.childrenTitles && p.childrenTitles !== "hide") ||
      state.settings.autoAdd,
    );
  });
  // Choosing an explicit “Anything”/“Any length” also counts as user input.
  function setValue(change) {
    if (initialSetup && (saving.current || state.busy)) return;
    setHasChosen(true);
    const next =
      typeof change === "function" ? change(valueRef.current) : change;
    valueRef.current = next;
    updateValue(next);
    // Start the write immediately, so closing the dialog cannot cancel a timer.
    if (!initialSetup) void save(next, false);
  }
  const [autoAdd, setAutoAdd] = useState(state.settings.autoAdd);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  function toggle(field, id) {
    setValue((current) => ({
      ...current,
      [field]: current[field].includes(id)
        ? current[field].filter((item) => item !== id)
        : [...current[field], id],
    }));
  }
  async function save(preferences, closeWhenDone = true) {
    if (!initialSetup) {
      const version = ++saveVersion.current;
      setSaved(false);
      setError("");
      try {
        await store.saveViewingPreferences(preferences);
        if (version === saveVersion.current) setSaved(true);
      } catch (failure) {
        if (version === saveVersion.current) setError(failure.message);
      }
      return;
    }
    if (saving.current || state.busy) return;
    saving.current = true;
    setSaved(false);
    setPending(true);
    setError("");
    try {
      await store.savePreferences(preferences, initialSetup ? { autoAdd } : {});
      setSaved(true);
      if (closeWhenDone) onComplete();
    } catch (failure) {
      setError(failure.message);
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <span className="eyebrow">
        {state.onboardingComplete
          ? "Your viewing preferences"
          : "One more thing"}
      </span>
      <h2>What are you in the mood for?</h2>
      <p>Pick as many as you like. You can change these in Settings anytime.</p>
      {!initialSetup && saved && (
        <div className="preference-save-toast" role="status" aria-live="polite">
          Preferences saved
        </div>
      )}
      {initialSetup && state.session.connected && (
        <>
          <p>
            Your MAL Plan to Watch is already in Watchlist. Watching, completed,
            and dropped shows help tailor your picks, even without ratings.
          </p>
          <MalWatchlistOption
            enabled={autoAdd}
            onChange={(enabled) => {
              setHasChosen(true);
              setAutoAdd(enabled);
            }}
            disabled={initialSetup && (pending || state.busy)}
          />
        </>
      )}
      <GenrePreferences
        value={value}
        setValue={setValue}
        disabled={initialSetup && (pending || state.busy)}
      />
      {showTasteSetup && (
        <TasteSetup
          value={value}
          setValue={setValue}
          store={store}
          disabled={initialSetup && (pending || state.busy)}
          preview={state.preview}
          showGenres={false}
        />
      )}
      <fieldset
        className="preference-group"
        disabled={initialSetup && (pending || state.busy)}
      >
        <legend>What would you like to watch?</legend>
        <button
          className="any-choice"
          aria-pressed={!value.formats.length}
          onClick={() => setValue((current) => ({ ...current, formats: [] }))}
        >
          Anything
        </button>
        <div className="preference-grid">
          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option.id}
              className="preference-option"
              aria-pressed={value.formats.includes(option.id)}
              onClick={() => toggle("formats", option.id)}
            >
              <strong>{option.label}</strong>
              <span>{option.detail}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset
        className="preference-group"
        disabled={initialSetup && (pending || state.busy)}
      >
        <legend>How long a series?</legend>
        <p className="preference-help">
          Movies and standalone specials aren't restricted by this choice.
        </p>
        <button
          className="any-choice"
          aria-pressed={!value.lengths.length}
          onClick={() => setValue((current) => ({ ...current, lengths: [] }))}
        >
          Any length
        </button>
        <div className="preference-grid">
          {LENGTH_OPTIONS.map((option) => (
            <button
              key={option.id}
              className="preference-option"
              aria-pressed={value.lengths.includes(option.id)}
              onClick={() => toggle("lengths", option.id)}
            >
              <strong>{option.label}</strong>
              <span>{option.detail}</span>
            </button>
          ))}
        </div>
        <small>
          *Examples assume 24-minute episodes. Cards show an estimate using the
          title's own runtime.
        </small>
      </fieldset>
      <fieldset
        className="preference-group"
        disabled={initialSetup && (pending || state.busy)}
      >
        <legend>MyAnimeList score</legend>
        <p>
          Only show anime within this community rating range, out of 10. This
          uses the anime’s overall MAL score.
        </p>
        <div className="preference-score-range">
          {[
            ["scoreMin", "Minimum score"],
            ["scoreMax", "Maximum score"],
          ].map(([field, label]) => (
            <label key={field}>
              {label}
              <select
                aria-label={label}
                value={value[field] ?? "any"}
                onChange={(event) => {
                  const score =
                    event.target.value === "any"
                      ? null
                      : Number(event.target.value);
                  setValue((current) => {
                    const next = { ...current, [field]: score };
                    if (
                      next.scoreMin != null &&
                      next.scoreMax != null &&
                      next.scoreMin > next.scoreMax
                    ) {
                      next[field === "scoreMin" ? "scoreMax" : "scoreMin"] =
                        score;
                    }
                    return next;
                  });
                }}
              >
                <option value="any">Any</option>
                {Array.from({ length: 19 }, (_, i) => 1 + i * 0.5).map(
                  (score) => (
                    <option key={score} value={score}>
                      {score.toFixed(1)}
                    </option>
                  ),
                )}
              </select>
            </label>
          ))}
        </div>
        {(value.scoreMin != null || value.scoreMax != null) && (
          <p className="preference-help">
            Unscored anime are excluded. Changes apply to new Discover picks and
            when you refresh Recommendations.
          </p>
        )}
      </fieldset>
      <div className="setting-row">
        <div>
          <strong>Include children’s and all-ages anime</strong>
          <p>
            Off excludes Kids-tagged, PG · Children, and G · All ages titles.
            When enabled, occasional picks appear only if your likes or MAL
            ratings show a clear interest.
          </p>
        </div>
        <input
          type="checkbox"
          role="switch"
          aria-label="Include children’s and all-ages anime"
          checked={value.childrenTitles === "include"}
          disabled={initialSetup && (pending || state.busy)}
          onChange={(event) =>
            setValue((current) => ({
              ...current,
              childrenTitles: event.target.checked ? "include" : "hide",
            }))
          }
        />
      </div>
      <fieldset
        className="preference-group"
        disabled={initialSetup && (pending || state.busy)}
      >
        <legend>Movie continuity</legend>
        <div className="setting-row">
          <div>
            <strong>Include non-canon movies</strong>
            <p>
              Off hides movies identified as outside their main story
              continuity. Movies with unknown continuity can still appear;
              MyAnimeList does not label every movie.
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Include non-canon movies"
            checked={value.includeNonCanonMovies === true}
            onChange={(event) =>
              setValue((current) => ({
                ...current,
                includeNonCanonMovies: event.target.checked,
              }))
            }
          />
        </div>
      </fieldset>
      <div className="setting-row">
        <div>
          <strong>Finished shows only</strong>
          <p>Leave off to include ongoing and upcoming titles.</p>
        </div>
        <input
          type="checkbox"
          role="switch"
          aria-label="Finished shows only"
          checked={value.finishedOnly}
          disabled={initialSetup && (pending || state.busy)}
          onChange={(event) =>
            setValue((current) => ({
              ...current,
              finishedOnly: event.target.checked,
            }))
          }
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>Include unknown lengths or formats</strong>
          <p>Keep titles whose episode count or format isn't available.</p>
        </div>
        <input
          type="checkbox"
          role="switch"
          aria-label="Include unknown lengths or formats"
          checked={value.includeUnknown}
          disabled={initialSetup && (pending || state.busy)}
          onChange={(event) =>
            setValue((current) => ({
              ...current,
              includeUnknown: event.target.checked,
            }))
          }
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!initialSetup && error && (
        <button
          className="quiet"
          disabled={initialSetup && (pending || state.busy)}
          onClick={() => save(value, false)}
        >
          Retry
        </button>
      )}
      {initialSetup && (
        <button
          className="primary full-width"
          disabled={pending || state.busy || !hasChosen}
          onClick={() => save(value)}
        >
          {pending ? "Finding your anime…" : "Start shuffling"}
        </button>
      )}
      {initialSetup && !hasChosen && (
        <button
          className="quiet"
          disabled={initialSetup && (pending || state.busy)}
          onClick={() => save(defaultPreferences())}
        >
          Surprise me — any anime
        </button>
      )}
    </>
  );
}
