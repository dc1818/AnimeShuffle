import { useEffect, useId, useRef, useState } from "react";

import { CATEGORY_TREE } from "../lib/category-tree.js";
import { CategoryPopover } from "./CategoryPopover.jsx";

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
export function TaxonomyPreferences({
  value,
  setValue,
  expanded = false,
  tree = CATEGORY_TREE,
}) {
  const TAXONOMY_BY_ID = tree.byId;
  const SELECTABLE_NODES = tree.selectable;
  const [opened, setOpened] = useState(
    () => new Set(["anime-taxonomy/audience-demographic"]),
  );
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(40);
  const id = useId();
  const [reading, setReading] = useState(null);
  const searchInput = useRef(null);
  const opener = useRef(null);
  const browser = useRef(null);
  const [revealed, setRevealed] = useState(null);
  const reader = TAXONOMY_BY_ID.get(reading);
  const notes = categoryNotes[reading];
  const paneId = `${id}-category-help`;
  const closeReader = () => {
    setReading(null);
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
    if (!reading && opener.current) {
      const target = opener.current.isConnected
        ? opener.current
        : searchInput.current;
      target?.focus({ preventScroll: true });
    }
  }, [reading]);
  const reveal = (nodeId) => {
    const path = tree.paths.get(nodeId);
    if (!path) return;
    setOpened(
      (previous) =>
        new Set([
          ...previous,
          ...path
            .slice(1)
            .map((_, index) => path.slice(0, index + 2).join("/")),
        ]),
    );
    setQuery("");
    opener.current = null;
    setReading(null);
    setRevealed({ path: path.join("/") });
  };
  useEffect(() => {
    if (!revealed) return;
    const row = [
      ...(browser.current?.querySelectorAll("[data-path]") || []),
    ].find((el) => el.dataset.path === revealed.path);
    const control = row?.querySelector(
      ".interest-row input, .interest-row button",
    );
    control?.focus({ preventScroll: true });
    row
      ?.querySelector(".interest-row")
      ?.scrollIntoView?.({
        block: "center",
        inline: "nearest",
        behavior: "instant",
      });
  }, [revealed]);
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
  function branch(nodeId, ancestors = [], relation = null, level = 0) {
    const node = TAXONOMY_BY_ID.get(nodeId);
    if (!node || ancestors.includes(nodeId)) return null;
    const pathParts = [...ancestors, nodeId];
    const path = pathParts.join("/");
    const children = tree.children(nodeId, ancestors);
    const selectable = node.kind === "category";
    if (!selectable && !children.length) return null;
    const open = opened.has(path);
    const childrenId = `${id}-${pathParts.map(encodeURIComponent).join("/")}`;
    return (
      <li
        key={path}
        className={`interest-branch tree-level-${level}`}
        data-node-id={nodeId}
        data-path={path}
      >
        <div
          className={`interest-row ${children.length ? "has-children" : "is-leaf"} ${level === 0 ? "is-main" : ""} ${selected.includes(nodeId) ? "is-selected" : ""} ${reading === nodeId ? "is-reading" : ""}`}
        >
          {children.length ? (
            <>
              {selectable && (
                <label className="interest-branch-choice">
                  <input
                    className="interest-branch-check"
                    type="checkbox"
                    aria-label={`Select ${node.label}`}
                    checked={selected.includes(nodeId)}
                    disabled={
                      !selected.includes(nodeId) && selected.length >= 64
                    }
                    onChange={() => toggle(nodeId)}
                  />
                </label>
              )}
              <button
                type="button"
                className="interest-branch-toggle"
                aria-label={`${open ? "Collapse" : "Expand"} ${node.label}`}
                aria-expanded={open}
                aria-controls={childrenId}
                onClick={() => expand(path)}
              >
                <svg
                  className="interest-chevron"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path d={open ? "M5 7l5 5 5-5" : "M7 5l5 5-5 5"} />
                </svg>
                <strong>{node.label}</strong>
              </button>
            </>
          ) : (
            <label className="interest-selection">
              <input
                type="checkbox"
                aria-label={`Select ${node.label}`}
                checked={selected.includes(nodeId)}
                disabled={!selected.includes(nodeId) && selected.length >= 64}
                onChange={() => toggle(nodeId)}
              />
              <span>{node.label}</span>
            </label>
          )}
          {info(node)}
        </div>
        {!!children.length && open && (
          <ul id={childrenId} className="interest-children">
            {children.map((e) => branch(e.child, pathParts, e.type, level + 1))}
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
        ref={searchInput}
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
        Expand a category to see its types. Check to add an interest. Tap ⓘ for
        its meaning.
      </p>
      <div className="interest-browser" ref={browser}>
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
              {tree
                .children(tree.root)
                .map((e) => branch(e.child, [tree.root], e.type))}
            </ul>
          )}
        </div>
        {reader && (
          <CategoryPopover
            id={paneId}
            title={reader.label}
            anchor={opener.current}
            onClose={closeReader}
          >
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
            {[
              ["Parent categories", tree.parents(reading)],
              ["Related categories", tree.related(reading)],
            ].map(
              ([label, connections]) =>
                connections.length > 0 && (
                  <div className="interest-context-links" key={label}>
                    <h5>{label}</h5>
                    {connections.map((node) => (
                      <button
                        type="button"
                        key={node.id}
                        onClick={() => reveal(node.id)}
                        title={`Show ${node.label} in the category tree`}
                      >
                        {node.label}
                      </button>
                    ))}
                  </div>
                ),
            )}
          </CategoryPopover>
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
        Category coverage varies by title. Related categories in the information
        panel do not imply a match.
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
