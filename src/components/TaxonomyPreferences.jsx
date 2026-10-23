import { useEffect, useId, useRef, useState } from "react";
import {
  TAXONOMY_BY_ID,
  SELECTABLE_NODES,
  nodeChildren,
  nodeParents,
} from "../lib/anime-taxonomy.js";

import { categoryDefinition, categoryNotes } from "../lib/category-help.js";

function InfoButton({ node, active, paneId, onRead }) {
  const [dismissed, setDismissed] = useState(false);
  return (
    <span
      className={`interest-info-wrap ${dismissed ? "tooltip-dismissed" : ""}`}
    >
      <button
        type="button"
        className="interest-info"
        aria-label={`About ${node.label}`}
        aria-expanded={active}
        aria-controls={paneId}
        onMouseEnter={() => setDismissed(false)}
        onFocus={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDismissed(true);
          }
        }}
        onClick={(event) => onRead(node.id, event.currentTarget)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v7" />
          <circle className="info-dot" cx="12" cy="7" r="1" />
        </svg>
      </button>
      <span className="interest-tooltip" role="tooltip">
        About {node.label}
      </span>
    </span>
  );
}

/** Expand only visible branches. Shared DAG nodes use one selection, independent of path. */
export function TaxonomyPreferences({ value, setValue, expanded = false }) {
  const [opened, setOpened] = useState(
    () => new Set(["anime-taxonomy/audience-demographic"]),
  );
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(40);
  const id = useId();
  const [reading, setReading] = useState(null);
  const heading = useRef(null);
  const opener = useRef(null);
  const reader = TAXONOMY_BY_ID.get(reading);
  const notes = categoryNotes[reading];
  const paneId = `${id}-category-help`;
  const closeReader = () => {
    setReading(null);
    if (opener.current?.isConnected) opener.current.focus();
  };
  const read = (nodeId, button) => {
    if (nodeId === reading) {
      closeReader();
      return;
    }
    if (button) opener.current = button;
    setReading(nodeId);
  };
  useEffect(() => {
    if (reading) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView?.({
        block: "nearest",
        behavior: "instant",
      });
    }
  }, [reading]);
  const info = (node) => (
    <InfoButton
      node={node}
      active={reading === node.id}
      paneId={paneId}
      onRead={read}
    />
  );
  const selected = value.preferredNodes || [];
  const search = query.trim().toLocaleLowerCase();
  const results = search
    ? SELECTABLE_NODES.filter((n) =>
        [n.label, n.id, ...n.aliases, categoryDefinition(n)].some((s) =>
          s.toLocaleLowerCase().includes(search),
        ),
      )
    : [];
  const toggle = (nodeId) =>
    setValue((p) => ({
      ...p,
      preferredNodes: (p.preferredNodes || []).includes(nodeId)
        ? p.preferredNodes.filter((x) => x !== nodeId)
        : [...(p.preferredNodes || []), nodeId].slice(0, 64),
      ...(nodeId === "kodomo" && !p.preferredNodes?.includes(nodeId)
        ? { childrenTitles: "include" }
        : {}),
    }));
  const expand = (path) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  function branch(nodeId, ancestors = [], relation = null) {
    const node = TAXONOMY_BY_ID.get(nodeId);
    if (!node || ancestors.includes(nodeId)) return null;
    const path = [...ancestors, nodeId].join("/");
    const children = [
      ...new Map(
        nodeChildren(nodeId)
          .filter((e) => ![...ancestors, nodeId].includes(e.child))
          .map((e) => [e.child, e]),
      ).values(),
    ];
    const selectable = node.kind === "category";
    const open = opened.has(path);
    const childrenId = `${id}-${path.replaceAll("/", "-")}`;
    return (
      <li key={path} className="interest-branch">
        <div
          className={`interest-row ${selected.includes(nodeId) ? "is-selected" : ""} ${reading === nodeId ? "is-reading" : ""}`}
        >
          {children.length ? (
            <button
              type="button"
              className="interest-expand"
              aria-label={`${open ? "Collapse" : "Expand"} ${node.label}`}
              aria-expanded={open}
              aria-controls={childrenId}
              onClick={() => expand(path)}
            >
              <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>
          ) : (
            <span className="interest-spacer" aria-hidden="true" />
          )}
          {selectable ? (
            <label className="interest-selection">
              <input
                type="checkbox"
                aria-label={`Select ${node.label}`}
                checked={selected.includes(nodeId)}
                disabled={!selected.includes(nodeId) && selected.length >= 64}
                onChange={() => toggle(nodeId)}
              />
              <span>
                {node.label}
                {relation === "related" && <small>Related category</small>}
              </span>
            </label>
          ) : (
            <button
              type="button"
              className="interest-family"
              aria-expanded={open}
              aria-controls={childrenId}
              onClick={() => expand(path)}
            >
              {node.label} <small>({children.length})</small>
            </button>
          )}
          {info(node)}
        </div>
        {!!children.length && open && (
          <ul
            id={childrenId}
            className={`interest-children ${ancestors.length >= 3 ? "interest-deep" : ""}`}
          >
            {children.map((e) =>
              branch(e.child, [...ancestors, nodeId], e.type),
            )}
          </ul>
        )}
      </li>
    );
  }
  const contents = (
    <>
      <label className="interest-search-label" htmlFor={`${id}-search`}>
        Search interests
      </label>
      <input
        id={`${id}-search`}
        type="search"
        placeholder="Search by name or meaning…"
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(40);
        }}
      />
      <div className="interest-selected">
        <p className="interest-selected-title" role="status">
          Selected interests · {selected.length}
        </p>
        {selected.length ? (
          <div className="interest-chips" aria-label="Selected anime interests">
            {selected.map((nodeId) => (
              <button
                key={nodeId}
                type="button"
                onClick={() => toggle(nodeId)}
                aria-label={`Remove ${TAXONOMY_BY_ID.get(nodeId)?.label || nodeId}`}
              >
                {TAXONOMY_BY_ID.get(nodeId)?.label || nodeId}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : (
          <p>Choose a checkbox below to add an interest.</p>
        )}
        {selected.length >= 64 && (
          <p role="status">64 interests selected. Remove one to add another.</p>
        )}
      </div>
      <p className="interest-legend">
        Check to add. Click or tap ⓘ for details. Arrows show subcategories.
      </p>
      <div className={`interest-browser ${reader ? "has-reader" : ""}`}>
        <div className="interest-list">
          {search ? (
            <>
              <p className="interest-search-count" role="status">
                {results.length} matching interests
              </p>
              <ul
                className="interest-tree interest-search-results"
                aria-label="Matching anime interests"
              >
                {results.slice(0, limit).map((n) => (
                  <li
                    key={n.id}
                    className={`interest-row ${reading === n.id ? "is-reading" : ""}`}
                  >
                    <label className="interest-selection">
                      <input
                        type="checkbox"
                        aria-label={`Select ${n.label}`}
                        checked={selected.includes(n.id)}
                        disabled={
                          !selected.includes(n.id) && selected.length >= 64
                        }
                        onChange={() => toggle(n.id)}
                      />
                      <span>
                        {n.label}
                        <small>{n.facet}</small>
                      </span>
                    </label>
                    {info(n)}
                  </li>
                ))}
              </ul>
              {!results.length && <p>No interests found. Try another name.</p>}
              {results.length > limit && (
                <button type="button" onClick={() => setLimit(limit + 40)}>
                  Show more ({results.length - limit} remaining)
                </button>
              )}
            </>
          ) : (
            <ul className="interest-tree" aria-label="Anime category branches">
              {nodeChildren("anime-taxonomy").map((e) =>
                branch(e.child, ["anime-taxonomy"], e.type),
              )}
            </ul>
          )}
        </div>
        {reader && (
          <section
            id={paneId}
            className="interest-reader"
            aria-labelledby={`${paneId}-title`}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeReader();
              }
            }}
          >
            <div className="interest-reader-heading">
              <h4 ref={heading} tabIndex={-1} id={`${paneId}-title`}>
                {reader.label}
              </h4>
              <button
                type="button"
                className="interest-reader-close"
                onClick={closeReader}
                aria-label="Close category details"
              >
                ×
              </button>
            </div>
            <p className="interest-context">
              {reader.kind === "category" ? reader.facet : "Category group"}
            </p>
            <p className="interest-definition">{categoryDefinition(reader)}</p>
            {!!notes?.points?.length && (
              <>
                <h5>What to expect</h5>
                <ul>
                  {notes.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </>
            )}
            {notes?.note && (
              <p className="interest-reading-note">{notes.note}</p>
            )}
            {reader.kind === "category" && (
              <button
                type="button"
                className="interest-reader-select"
                aria-pressed={selected.includes(reading)}
                disabled={!selected.includes(reading) && selected.length >= 64}
                onClick={() => toggle(reading)}
              >
                {selected.includes(reading)
                  ? `✓ Added · remove ${reader.label}`
                  : `+ Add ${reader.label}`}
              </button>
            )}
            <p className="interest-reading-note">
              Reading a category does not select it.
            </p>
            {nodeParents(reading).filter((e) => e.parent !== "anime-taxonomy")
              .length > 0 && (
              <div className="interest-context-links">
                <h5>Browse connections</h5>
                {nodeParents(reading)
                  .filter((e) => e.parent !== "anime-taxonomy")
                  .map((e) => (
                    <button
                      type="button"
                      key={`${e.parent}-${e.type}`}
                      onClick={() => read(e.parent)}
                    >
                      {TAXONOMY_BY_ID.get(e.parent)?.label}
                      <small>
                        {e.type === "related"
                          ? "Related category"
                          : "Parent category"}
                      </small>
                    </button>
                  ))}
              </div>
            )}
          </section>
        )}
      </div>
      <label className="interest-restrict">
        <input
          type="checkbox"
          checked={value.restrictNodes === true}
          onChange={(e) =>
            setValue((p) => ({ ...p, restrictNodes: e.target.checked }))
          }
        />
        <span>Only show anime matching my selected interests</span>
      </label>
      <p className="interest-filter-help">
        {value.restrictNodes && selected.length
          ? "Each title must match at least one selected interest, plus your other filters. Titles with unknown tags are excluded."
          : "Interests guide your picks; other categories can still appear."}{" "}
        Category coverage varies by title. Related branches help you browse;
        they do not imply a match.
      </p>
    </>
  );
  return expanded ? (
    <section className="interest-editor" aria-label="Anime interests">
      <h3>Anime interests</h3>
      {contents}
    </section>
  ) : (
    <details className="interest-editor">
      <summary>Explore anime categories · optional</summary>
      {contents}
    </details>
  );
}
