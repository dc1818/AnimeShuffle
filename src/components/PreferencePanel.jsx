import { useEffect, useId, useRef } from "react";
import { Icon } from "./Icon.jsx";

/** Shared dialog geometry: header/footer stay put; only the selected section scrolls. */
export function PreferencePanel({
  title,
  titleId,
  sections,
  section,
  onSection,
  children,
  footer,
  mobileSelect = true,
}) {
  const id = useId();
  const content = useRef(null);
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [section]);
  return (
    <div className="preference-panel">
      <header className="panel-heading">
        <h2 id={titleId}>{title}</h2>
      </header>
      <div className="panel-workspace">
        <nav className="panel-navigation" aria-label={`${title} sections`}>
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === section ? "page" : undefined}
              aria-controls={`${id}-content`}
              onClick={() => onSection(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="panel-main">
          {mobileSelect ? (
            <label className="panel-mobile-select">
              <span className="sr-only">{title} section</span>
              <select
                aria-label={`${title} section`}
                value={section}
                onChange={(e) => onSection(e.target.value)}
              >
                {sections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            section !== sections[0].id && (
              <button
                className="panel-mobile-back"
                onClick={() => onSection(sections[0].id)}
              >
                <Icon name="undo" />
                Back to Settings
              </button>
            )
          )}
          <div ref={content} id={`${id}-content`} className="panel-content">
            {children}
          </div>
        </div>
      </div>
      <footer className="panel-footer">{footer}</footer>
    </div>
  );
}
