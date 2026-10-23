import { AmbientBackground, BACKGROUND_STYLES } from "./AmbientBackground.jsx";

export function BackgroundOptions({ settings, onChange }) {
  const selected =
    settings.dynamic === false
      ? "off"
      : BACKGROUND_STYLES.some(([key]) => key === settings.backgroundStyle)
        ? settings.backgroundStyle
        : "aurora";
  return (
    <fieldset className="background-options">
      <legend>Background</legend>
      <p>Colors follow the anime on screen.</p>
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
      <p className="background-motion-note">
        Motion respects your device and reduced-motion settings. Animation
        pauses when hardware acceleration can’t be verified or performance is
        slow.
      </p>
    </fieldset>
  );
}
