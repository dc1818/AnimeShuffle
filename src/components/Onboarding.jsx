import { useState } from "react";
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
        Accounts belong to this local installation. Email-based password
        recovery is not available yet.
      </p>
    </>
  );
}

/** Empty selections mean “any”; multiple choices are ORed within each category. */
export function ViewingPreferences({ state, store, onComplete }) {
  const [value, setValue] = useState(state.preferences);
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
  async function save(preferences) {
    if (pending || state.busy) return;
    setPending(true);
    setError("");
    try {
      await store.savePreferences(preferences);
      onComplete();
    } catch (failure) {
      setError(failure.message);
    } finally {
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
      <TasteSetup
        value={value}
        setValue={setValue}
        store={store}
        disabled={pending || state.busy}
        preview={state.preview}
      />
      <fieldset className="preference-group" disabled={pending || state.busy}>
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
      <fieldset className="preference-group" disabled={pending || state.busy}>
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
          disabled={pending || state.busy}
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
          disabled={pending || state.busy}
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
      <button
        className="primary full-width"
        disabled={pending || state.busy}
        onClick={() => save(value)}
      >
        {pending ? "Finding your anime…" : "Start shuffling"}
      </button>
      {!state.onboardingComplete && (
        <button
          className="quiet"
          disabled={pending || state.busy}
          onClick={() => save(defaultPreferences())}
        >
          Surprise me — any anime
        </button>
      )}
    </>
  );
}
