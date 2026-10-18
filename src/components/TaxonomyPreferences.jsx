import { useId, useState } from "react";
import {
  TAXONOMY_BY_ID,
  SELECTABLE_NODES,
  nodeChildren,
  nodeParents,
} from "../lib/anime-taxonomy.js";
/** Browse any depth without mounting a 287-node tree or duplicating shared nodes. */
export function TaxonomyPreferences({ value, setValue }) {
  const [trail, setTrail] = useState(["anime-taxonomy"]),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(40);
  const searchId = useId(),
    current = trail.at(-1),
    selected = value.preferredNodes || [];
  const search = query.trim().toLocaleLowerCase();
  const rows = search
    ? SELECTABLE_NODES.filter((n) =>
        [n.label, n.id, ...n.aliases].some((x) =>
          x.toLocaleLowerCase().includes(search),
        ),
      ).map((n) => ({ node: n, type: null }))
    : nodeChildren(current).map((e) => ({
        node: TAXONOMY_BY_ID.get(e.child),
        type: e.type,
      }));
  const unique = [...new Map(rows.map((r) => [r.node.id, r])).values()];
  const toggle = (id) =>
    setValue((p) => ({
      ...p,
      preferredNodes: (p.preferredNodes || []).includes(id)
        ? p.preferredNodes.filter((x) => x !== id)
        : [...(p.preferredNodes || []), id].slice(0, 64),
      ...(id === "kodomo" && !p.preferredNodes?.includes(id)
        ? { childrenTitles: "include" }
        : {}),
    }));
  const open = (id) => {
    setTrail([...trail, id]);
    setQuery("");
    setLimit(40);
  };
  return (
    <details className="taxonomy-preferences">
      <summary>
        Explore anime categories{" "}
        <span>
          {selected.length ? `${selected.length} selected` : "Optional"}
        </span>
      </summary>
      <p>
        Follow broad categories into more specific ones, or search by name. A
        category can appear in several places.
      </p>
      <label className="taxonomy-restrict">
        <input
          type="checkbox"
          checked={value.restrictNodes === true}
          onChange={(e) =>
            setValue((p) => ({ ...p, restrictNodes: e.target.checked }))
          }
        />{" "}
        Only show anime matching my selected categories
      </label>
      <p className="taxonomy-help">
        {value.restrictNodes && selected.length
          ? "Matches at least one selected category, plus your other viewing filters. Titles with unknown tags are excluded."
          : "Selections guide your taste; other categories can still appear."}{" "}
        Category coverage varies by title. Related links help you browse; they
        do not imply a match.
      </p>
      {!!selected.length && (
        <div
          className="taxonomy-selected"
          aria-label="Selected anime categories"
        >
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-label={`Remove ${TAXONOMY_BY_ID.get(id)?.label}`}
            >
              {TAXONOMY_BY_ID.get(id)?.label} ×
            </button>
          ))}
          <button
            type="button"
            onClick={() => setValue((p) => ({ ...p, preferredNodes: [] }))}
          >
            Clear categories
          </button>
        </div>
      )}
      <label htmlFor={searchId}>Search categories</label>
      <input
        id={searchId}
        type="search"
        placeholder="Try isekai, real robot, school…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(40);
        }}
      />
      {!search && (
        <nav className="taxonomy-breadcrumbs" aria-label="Category location">
          {trail.map((id, i) => (
            <button
              type="button"
              key={`${id}-${i}`}
              onClick={() => setTrail(trail.slice(0, i + 1))}
              aria-current={i === trail.length - 1 ? "location" : undefined}
            >
              {id === "anime-taxonomy"
                ? "All categories"
                : TAXONOMY_BY_ID.get(id).label}
            </button>
          ))}
        </nav>
      )}
      {current !== "anime-taxonomy" && !search && (
        <p className="taxonomy-help">
          {TAXONOMY_BY_ID.get(current).definition ||
            TAXONOMY_BY_ID.get(current).label}
          {nodeParents(current).filter((e) => e.parent !== "anime-taxonomy")
            .length > 1
            ? " · Appears in multiple branches."
            : ""}
        </p>
      )}
      <div className="taxonomy-options" aria-label="Category choices">
        {unique.slice(0, limit).map(({ node: n, type }) => {
          const nested = nodeChildren(n.id).length,
            selectable = n.kind === "category";
          return (
            <div className="taxonomy-option" key={n.id}>
              <button
                type="button"
                className="taxonomy-choice"
                title={n.definition || n.label}
                aria-pressed={selectable ? selected.includes(n.id) : undefined}
                onClick={() => (selectable ? toggle(n.id) : open(n.id))}
              >
                <span>{n.label}</span>
                <small>
                  {type === "related"
                    ? "Related category"
                    : n.kind === "structural"
                      ? "Browse family"
                      : n.facet}
                </small>
              </button>
              {!!nested && selectable && (
                <button
                  type="button"
                  className="taxonomy-drill"
                  onClick={() => open(n.id)}
                  aria-label={`Explore ${n.label}: ${nested} categories`}
                >
                  {nested} ›
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!unique.length && (
        <p role="status">
          No categories found. Try another name or go back to a broader
          category.
        </p>
      )}
      {unique.length > limit && (
        <button type="button" onClick={() => setLimit(limit + 40)}>
          Show more ({unique.length - limit} remaining)
        </button>
      )}
    </details>
  );
}
