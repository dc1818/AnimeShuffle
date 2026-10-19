import { useState } from "react";
import { mergeTaxonomyAnalytics } from "../lib/taxonomy-analytics.js";

export function TaxonomyAnalytics({ reactions, api, catalogTotal = 0 }) {
  const [catalog, setCatalog] = useState(null),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [query, setQuery] = useState("");
  const [coverage, setCoverage] = useState("all");
  const complete = catalog && catalog.nextCursor === null;
  async function scan(restart = false) {
    setBusy(true);
    setError("");
    try {
      const page = await api(
        `/api/admin/taxonomy?after=${restart ? 0 : catalog?.nextCursor || 0}`,
      );
      setCatalog((previous) =>
        mergeTaxonomyAnalytics(restart ? null : previous, page),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = (reactions?.nodes || [])
    .map((r) => {
      const c = catalog?.nodes.find((n) => n.id === r.id);
      return { ...r, direct: c?.direct || 0, inherited: c?.inherited || 0 };
    })
    .filter(
      (r) =>
        `${r.label} ${r.facet}`.toLowerCase().includes(query.toLowerCase()) &&
        (coverage !== "missing" || (!r.direct && !r.inherited)),
    )
    .sort(
      (a, b) =>
        b.good + b.bad + b.watch + b.nope - a.good - a.bad - a.watch - a.nope ||
        a.label.localeCompare(b.label),
    );
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              catalogScanComplete: !!complete,
              catalogTotalAtLoad: catalogTotal,
              catalog,
              reactions,
              scope:
                "Stored catalog metadata and sampled current reactions; missing categories are unknown. Counts are associations, not causal preference or recommendation accuracy.",
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "anime-shuffle-category-analytics.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="admin-panel"
      aria-labelledby="taxonomy-analytics-heading"
    >
      <h3 id="taxonomy-analytics-heading">Category coverage &amp; reactions</h3>
      <p>
        Uses the same category graph as Discover and Recommendations. Reaction
        counts include known categories and reviewed inherited parents, once per
        category per reaction. A title can belong to several categories; these
        counts do not show which category caused the reaction.
      </p>
      <p>
        Catalog coverage is scanned only when requested, in pages of up to 250
        titles. This adds no AI calls. Scans read stored metadata, not the
        entire MAL catalog, and do not change recommendations.
      </p>
      <div className="admin-actions">
        <button
          className="soft-button"
          disabled={busy || !!complete}
          onClick={() => scan()}
        >
          {busy
            ? "Scanning…"
            : catalog
              ? "Scan next 250 titles"
              : "Scan catalog coverage"}
        </button>
        {catalog && (
          <button
            className="soft-button"
            disabled={busy}
            onClick={() => scan(true)}
          >
            Restart scan
          </button>
        )}
        <button className="soft-button" onClick={download}>
          Export category analytics
        </button>
      </div>
      {error && (
        <p role="alert" className="admin-alert">
          {error}
        </p>
      )}
      <p role="status">
        {catalog
          ? `${complete ? "Complete scan" : "Partial scan"}: ${catalog.titleCount.toLocaleString()} titles scanned; ${catalog.contentCovered.toLocaleString()} have a known category beyond release format; ${catalog.inheritedTitles.toLocaleString()} gain a reviewed parent category.`
          : "Catalog coverage has not been scanned."}{" "}
        {catalogTotal.toLocaleString()} titles were stored when this page
        loaded.
      </p>
      <p className="muted">
        Graph: {reactions?.version}. Reactions:{" "}
        {(reactions?.reactionCount || 0).toLocaleString()} sampled current
        choices. Zero coverage means unknown in the scanned metadata, not that
        no anime belongs to that category. Separate scans and reaction snapshots
        can differ as data changes.
      </p>
      <div className="admin-columns">
        <label>
          Search categories
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Mecha, Shounen, source…"
          />
        </label>
        <label>
          Coverage filter
          <select
            value={coverage}
            onChange={(e) => setCoverage(e.target.value)}
            disabled={!catalog}
          >
            <option value="all">All categories</option>
            <option value="missing">No coverage in scanned titles</option>
          </select>
        </label>
      </div>
      <div
        className="admin-table-scroll"
        style={{ maxHeight: "32rem", overflow: "auto" }}
      >
        <table>
          <thead>
            <tr>
              {[
                "Category",
                "Facet",
                "Direct titles",
                "Inherited titles",
                "Good",
                "Bad",
                "Would Watch",
                "Won’t Watch",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.label}</th>
                <td>{r.facet}</td>
                <td>{catalog ? r.direct : "Not scanned"}</td>
                <td>{catalog ? r.inherited : "Not scanned"}</td>
                <td>{r.good}</td>
                <td>{r.bad}</td>
                <td>{r.watch}</td>
                <td>{r.nope}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>No categories match this search.</p>}
    </section>
  );
}
