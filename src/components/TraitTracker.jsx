import { useMemo, useState } from "react";
import { traitTrackingState } from "../lib/extended-research-traits.js";

const stateLabel = {
  "not-assessed": "Not assessed",
  unknown: "Researched, still unknown",
  "low-confidence": "Low confidence",
  absent: "Evidence of absence",
  present: "Evidence of presence",
  uncertain: "Uncertain",
};
const privateTrait = (t, o) =>
  t.explanationSafe === false ||
  t.matchingEnabled === false ||
  o?.containsSpoilers === true;

/** Lazy, paginated matrix: do not mount thousands of rows per saved profile. */
export function TraitTracker({
  vocabulary = [],
  families = [],
  profile,
  revealed = false,
  onExport,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [family, setFamily] = useState("");
  const [state, setState] = useState("");
  const [use, setUse] = useState("");
  const [page, setPage] = useState(0);
  const [revealCatalog, setRevealCatalog] = useState(false);
  const showPrivate = profile ? revealed : revealCatalog;
  const observations = useMemo(
    () => new Map((profile?.observations || []).map((o) => [o.key, o])),
    [profile],
  );
  const recorded = vocabulary.filter((t) => observations.has(t.key)).length;
  const assessed = vocabulary.filter((t) =>
    Number.isFinite(observations.get(t.key)?.score),
  ).length;
  const rows = useMemo(
    () =>
      vocabulary.filter((t) => {
        const hidden = privateTrait(t, observations.get(t.key)) && !showPrivate;
        const searchable = hidden
          ? "private research"
          : `${t.label} ${t.key} ${t.definition || ""}`;
        return (
          (!search ||
            searchable.toLowerCase().includes(search.toLowerCase())) &&
          (!area || t.area === area) &&
          (!family || t.familyKey === family) &&
          (!state || traitTrackingState(observations.get(t.key)) === state) &&
          (!use ||
            (use === "matching") === !privateTrait(t, observations.get(t.key)))
        );
      }),
    [vocabulary, observations, search, area, family, state, use, showPrivate],
  );
  const update = (setter) => (e) => {
    setter(e.target.value);
    setPage(0);
  };
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 40) - 1),
  );
  return (
    <details
      className="trait-tracker"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <strong>
          {profile
            ? "Trait coverage for this anime"
            : "Search the complete trait catalog"}
        </strong>
        {profile
          ? ` — ${assessed} assessed, ${vocabulary.length - recorded} not assessed`
          : ` — ${vocabulary.length.toLocaleString()} supported traits`}
      </summary>
      {open && (
        <>
          <p>
            {profile
              ? "This view describes only this saved profile and exact MAL entry. Imported and Cloudflare profiles are listed separately in the library; matching combines eligible findings from both. "
              : "These are available research questions, not claims already made about any anime. "}
            Omitted traits are not assessed. Unknown means research was
            attempted without a conclusion. Presence describes how much a trait
            occurs, not whether viewers enjoy it.
          </p>
          <p>
            <strong>Matching:</strong> supported, sufficiently confident traits
            can influence suggestions. <strong>Private research:</strong> stored
            for later analysis, excluded from public responses and current
            ranking. Evidence and private findings stay hidden until revealed.
          </p>
          {!profile && (
            <button
              className="soft-button"
              onClick={() => {
                setRevealCatalog(!revealCatalog);
                setPage(0);
              }}
            >
              {revealCatalog
                ? "Hide private trait definitions"
                : "Reveal private trait definitions — may imply spoilers"}
            </button>
          )}
          <div className="trait-tracker-filters">
            <label>
              Find a trait
              <input
                value={search}
                onChange={update(setSearch)}
                placeholder="Search label, key or definition"
              />
            </label>
            <label>
              Area
              <select value={area} onChange={update(setArea)}>
                <option value="">All areas (including original traits)</option>
                {[...new Set(vocabulary.map((t) => t.area).filter(Boolean))]
                  .sort()
                  .map((v) => (
                    <option key={v}>{v}</option>
                  ))}
              </select>
            </label>
            <label>
              Family
              <select value={family} onChange={update(setFamily)}>
                <option value="">All families</option>
                {families.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            {profile && (
              <label>
                Assessment
                <select value={state} onChange={update(setState)}>
                  <option value="">All assessment states</option>
                  {Object.entries(stateLabel).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Algorithm use
              <select value={use} onChange={update(setUse)}>
                <option value="">All uses</option>
                <option value="matching">Matching</option>
                <option value="research">Private research only</option>
              </select>
            </label>
          </div>
          <p>
            {rows.length.toLocaleString()} traits match these filters.{" "}
            {profile && `${recorded - assessed} recorded as unknown.`}
          </p>
          {onExport && (
            <button className="soft-button" onClick={() => onExport(rows)}>
              Download selected trait definitions for analysis
            </button>
          )}
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Trait</th>
                  <th>Presence / confidence</th>
                  <th>Role</th>
                  <th>Evidence / use</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(currentPage * 40, currentPage * 40 + 40)
                  .map((t) => {
                    const o = observations.get(t.key),
                      hidden = privateTrait(t, o) && !showPrivate;
                    return (
                      <tr key={t.key}>
                        <td>
                          {hidden ? (
                            "Private research trait — reveal to inspect"
                          ) : (
                            <>
                              <strong>{t.label}</strong>
                              <small>
                                <code>{t.key}</code>
                              </small>
                              <small>{t.definition || t.category}</small>
                            </>
                          )}
                        </td>
                        <td>
                          {hidden && o ? (
                            "Private assessment hidden"
                          ) : (
                            <>
                              {profile
                                ? stateLabel[traitTrackingState(o)]
                                : "No anime selected"}
                              {o && (
                                <small>
                                  {o.score === null
                                    ? "Unknown presence"
                                    : `${Math.round(o.score * 100)}% presence`}{" "}
                                  / {Math.round(o.confidence * 100)}% confidence
                                </small>
                              )}
                            </>
                          )}
                        </td>
                        <td>{hidden && o ? "Hidden" : o?.prominence || "—"}</td>
                        <td>
                          {privateTrait(t, o)
                            ? "Private research only"
                            : "Eligible for matching"}
                          <small>
                            {t.evidenceOnly
                              ? "Requires critical or production evidence"
                              : "Explicit premise evidence allowed"}
                          </small>
                          {o && (
                            <small>
                              {showPrivate
                                ? `${o.evidence} Sources: ${o.sources.join(", ")}.`
                                : "Private evidence hidden"}
                            </small>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p>
              No matching traits. Private labels are not searchable while
              hidden.
            </p>
          )}
          <div className="trait-tracker-pages">
            <button
              className="soft-button"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous traits
            </button>
            <span>
              Page {currentPage + 1} of{" "}
              {Math.max(1, Math.ceil(rows.length / 40))}
            </span>
            <button
              className="soft-button"
              disabled={(currentPage + 1) * 40 >= rows.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Next traits
            </button>
          </div>
        </>
      )}
    </details>
  );
}
