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
      <legend>Animated background</legend>
      <p>
        Follows the current anime’s colors. Motion automatically stops when
        hardware acceleration cannot be verified, reduced motion is on, or
        performance is slow.
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
    </fieldset>
  );
}
