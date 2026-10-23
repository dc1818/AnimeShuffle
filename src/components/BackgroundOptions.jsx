import { resolveBackgroundStyle } from "./SceneEnvironment.jsx";
import { AmbientBackground, BACKGROUND_STYLES } from "./AmbientBackground.jsx";

export function BackgroundOptions({ settings, onChange }) {
  const selected =
    settings.dynamic === false
      ? "off"
      : BACKGROUND_STYLES.some(
            ([key]) => key === resolveBackgroundStyle(settings.backgroundStyle),
          )
        ? resolveBackgroundStyle(settings.backgroundStyle)
        : "aurora";
  return (
    <fieldset className="background-options">
      <legend>Background</legend>
      <p>
        Choose a scene. Its lights and moving objects can use the anime’s
        colors.
      </p>
      <div className="background-options-grid">
        {[...BACKGROUND_STYLES, ["off", "Off"]].map(([key, label]) => (
          <label className="background-choice" key={key}>
            <input
              type="radio"
              name="animated-background"
              value={key}
              checked={selected === key}
              onChange={() =>
                onChange({
                  dynamic: key !== "off",
                  ...(key !== "off" ? { backgroundStyle: key } : {}),
                })
              }
            />
            <span className="background-preview" aria-hidden="true">
              <AmbientBackground preview enabled={key !== "off"} style={key} />
            </span>
            <span className="background-choice-label">
              {label}
              {selected === key && (
                <span className="background-selected" aria-hidden="true">
                  ✓
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      <div className="background-controls">
        <label>
          <input
            type="checkbox"
            checked={settings.backgroundAnimated !== false}
            disabled={selected === "off"}
            onChange={(e) => onChange({ backgroundAnimated: e.target.checked })}
          />{" "}
          Animate background
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.backgroundMatchAnime !== false}
            disabled={selected === "off"}
            onChange={(e) =>
              onChange({ backgroundMatchAnime: e.target.checked })
            }
          />{" "}
          Match lights and accents to the anime
        </label>
      </div>
      <p className="background-motion-note">
        Turn animation off for a still scene. Motion also respects your device,
        reduced-motion settings and performance.
      </p>
    </fieldset>
  );
}
