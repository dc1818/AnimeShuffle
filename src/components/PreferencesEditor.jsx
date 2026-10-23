import { TaxonomyPreferences } from "./TaxonomyPreferences.jsx";
import { SETTINGS_SECTIONS } from "./SettingsPanel.jsx";
import { useState } from "react";
import { PreferencePanel } from "./PreferencePanel.jsx";
import { TasteSetup } from "./TasteSetup.jsx";
import { GenrePreferences } from "./GenrePreferences.jsx";
import {
  FORMAT_OPTIONS,
  LENGTH_OPTIONS,
  defaultPreferences,
} from "../lib/preferences.js";

const sections = [
  { id: "taste", label: "Taste", icon: "heart" },
  { id: "format", label: "Format & length", icon: "screen" },
  { id: "content", label: "Content & audience", icon: "users" },
  { id: "advanced", label: "Advanced filters", icon: "filters" },
];
const resetFields = {
  format: ["formats", "lengths"],
  content: ["requiredCategories", "includeNsfw", "childrenTitles"],
  advanced: [
    "scoreMin",
    "scoreMax",
    "finishedOnly",
    "includeNonCanonMovies",
    "includeUnknown",
    "requiredThemes",
  ],
};
function Toggle({ title, help, checked, onChange }) {
  return (
    <label className="setting-row panel-toggle">
      <span>
        <strong>{title}</strong>
        <span className="setting-help">{help}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={title}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
export function PreferencesEditor({
  state,
  store,
  value,
  setValue,
  saved,
  saving,
  error,
  onRetry,
  onComplete,
  onSettings,
}) {
  const [section, setSection] = useState("taste");
  const set = (key, next) => setValue((p) => ({ ...p, [key]: next }));
  const toggle = (key, id) =>
    setValue((p) => ({
      ...p,
      [key]: p[key].includes(id)
        ? p[key].filter((x) => x !== id)
        : [...p[key], id],
    }));
  const reset = () => {
    const defaults = defaultPreferences();
    setValue((p) => ({
      ...p,
      ...Object.fromEntries(
        resetFields[section].map((key) => [key, defaults[key]]),
      ),
    }));
  };
  return (
    <PreferencePanel
      title="Viewing preferences"
      titleId="preferences-title"
      sections={sections}
      section={section}
      onSection={setSection}
      workspaceNavigation={onSettings ? SETTINGS_SECTIONS : undefined}
      onWorkspaceNavigate={onSettings}
      footer={
        <>
          <div className="panel-save-status" role="status">
            {section === "taste" && (
              <span className="interest-footer-count">
                {value.preferredNodes?.length || 0} interests selected ·{" "}
              </span>
            )}
            {error
              ? "Changes need attention"
              : saving
                ? "Saving…"
                : saved
                  ? "Preferences saved"
                  : "Changes save automatically."}
          </div>
          {section !== "taste" && (
            <button
              className="panel-reset"
              onClick={reset}
              aria-label={`Reset ${sections.find((s) => s.id === section).label}`}
            >
              Reset section
            </button>
          )}
          <button className="primary" onClick={onComplete}>
            Done
          </button>
        </>
      }
    >
      {error && (
        <div className="panel-error">
          <p className="form-error" role="alert">
            {error}
          </p>
          <button className="outline" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {section === "taste" && (
        <>
          <TaxonomyPreferences value={value} setValue={setValue} expanded />
          <TasteSetup
            value={value}
            setValue={setValue}
            store={store}
            preview={state.preview}
            showGenres={false}
            editing
          />
          <GenrePreferences
            value={value}
            setValue={setValue}
            mode="taste"
            showTaxonomy={false}
          />
        </>
      )}
      {section === "format" && (
        <>
          {[
            [
              "formats",
              "Format",
              "Choose which types of anime to include.",
              "Anything",
              FORMAT_OPTIONS,
            ],
            [
              "lengths",
              "Episode length",
              "Applies to series. Movies and standalone specials aren’t restricted.",
              "Any length",
              LENGTH_OPTIONS,
            ],
          ].map(([key, title, help, any, options]) => (
            <fieldset className="preference-group panel-checks" key={key}>
              <legend>{title}</legend>
              <p>{help}</p>
              <label>
                <input
                  type="checkbox"
                  checked={!value[key].length}
                  onChange={() => set(key, [])}
                />
                <span>{any}</span>
              </label>
              {options.map((option) => (
                <label key={option.id} title={option.detail}>
                  <input
                    type="checkbox"
                    checked={value[key].includes(option.id)}
                    onChange={() => toggle(key, option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </>
      )}
      {section === "content" && (
        <>
          <GenrePreferences value={value} setValue={setValue} mode="audience" />
          <section className="panel-group">
            <h3>Content restrictions</h3>
            <Toggle
              title="Include NSFW anime"
              help="Allow titles marked suggestive or explicit by MyAnimeList. Saved watchlist entries are always kept."
              checked={value.includeNsfw === true}
              onChange={(v) => set("includeNsfw", v)}
            />
            <Toggle
              title="Include children’s and all-ages anime"
              help="Allow Kids-tagged, PG · Children and G · All ages titles when they match your tastes."
              checked={value.childrenTitles === "include"}
              onChange={(v) => set("childrenTitles", v ? "include" : "hide")}
            />
          </section>
        </>
      )}
      {section === "advanced" && (
        <>
          <fieldset className="preference-group">
            <legend>Community score</legend>
            <p>Filter by the overall MyAnimeList rating, out of 10.</p>
            <div className="preference-score-range">
              {[
                ["scoreMin", "Minimum score"],
                ["scoreMax", "Maximum score"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <select
                    aria-label={label}
                    value={value[key] ?? "any"}
                    onChange={(e) => {
                      const score =
                        e.target.value === "any"
                          ? null
                          : Number(e.target.value);
                      setValue((p) => {
                        const next = { ...p, [key]: score };
                        if (
                          next.scoreMin != null &&
                          next.scoreMax != null &&
                          next.scoreMin > next.scoreMax
                        )
                          next[key === "scoreMin" ? "scoreMax" : "scoreMin"] =
                            score;
                        return next;
                      });
                    }}
                  >
                    <option value="any">Any</option>
                    {Array.from({ length: 19 }, (_, i) => 1 + i * 0.5).map(
                      (n) => (
                        <option key={n} value={n}>
                          {n.toFixed(1)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ))}
            </div>
            {(value.scoreMin != null || value.scoreMax != null) && (
              <p>
                Unscored anime are excluded. Changes apply to new Discover picks
                and when you refresh Recommendations.
              </p>
            )}
          </fieldset>
          <Toggle
            title="Finished shows only"
            help="Only include fully aired shows. Leave off to include ongoing and upcoming titles."
            checked={value.finishedOnly}
            onChange={(v) => set("finishedOnly", v)}
          />
          <Toggle
            title="Include non-canon movies"
            help="Include movies identified as outside the main story. Unknown continuity is always allowed."
            checked={value.includeNonCanonMovies === true}
            onChange={(v) => set("includeNonCanonMovies", v)}
          />
          <Toggle
            title="Include unknown lengths or formats"
            help="Keep titles whose episode count or format isn’t available."
            checked={value.includeUnknown}
            onChange={(v) => set("includeUnknown", v)}
          />
          <GenrePreferences value={value} setValue={setValue} mode="themes" />
        </>
      )}
    </PreferencePanel>
  );
}
