import { useEffect, useState } from "react";
const number = (n) => Number(n || 0).toLocaleString();
const when = (n) => (n ? new Date(n).toLocaleString() : "Not yet checkpointed");
export function DatabaseUsage({ usage, api }) {
  const [current, setCurrent] = useState(usage),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setCurrent(usage), [usage]);
  if (!current) return null;
  return (
    <section className="admin-panel database-usage">
      <div className="admin-heading">
        <h2>Cloudflare database usage</h2>
        <button
          className="soft-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setCurrent(
                (await api("/api/admin/database-usage")).databaseUsage,
              );
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Refreshing…" : "Refresh row counters"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="muted">
        Observed SQL usage for this site · resets {when(current.resetsAt)}{" "}
        (00:00 UTC).
      </p>
      {!current.measured ? (
        <p>
          Cursor measurements are unavailable in this runtime. No estimated row
          counts are substituted.
        </p>
      ) : (
        <>
          <div className="database-meters">
            {[
              ["Rows read", current.rowsRead, current.readLimit],
              ["Rows written", current.rowsWritten, current.writeLimit],
            ].map(([label, used, limit]) => (
              <div key={label}>
                <strong>
                  {label}: {number(used)} / {number(limit)}
                </strong>
                <meter
                  aria-label={`${label} observed today`}
                  min="0"
                  max={limit}
                  value={Math.min(used, limit)}
                />
                <small>
                  {((100 * used) / limit).toFixed(1)}% of the free daily
                  allowance observed
                </small>
              </div>
            ))}
          </div>
          <p role="status">
            <strong>
              {current.backgroundPaused
                ? "Background enrichment paused to protect site access."
                : "Background enrichment is within its app budget."}
            </strong>{" "}
            Pauses at {number(current.backgroundReadLimit)} observed reads or{" "}
            {number(current.backgroundWriteLimit)} writes. Normal browsing can
            continue using cached analysis.
          </p>
          <p className="muted">
            Tracking began {when(current.startedAt)}. Last checkpoint:{" "}
            {when(current.checkpointAt)}. Counters checkpoint every minute or
            after 10,000 reads / 1,000 writes.
          </p>
          <details>
            <summary>Largest sources of database reads</summary>
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Operation / table</th>
                    <th>Rows read</th>
                    <th>Rows written</th>
                    <th>Queries</th>
                  </tr>
                </thead>
                <tbody>
                  {current.groups.map((g) => (
                    <tr key={g.label}>
                      <td>{g.label}</td>
                      <td>{number(g.rowsRead)}</td>
                      <td>{number(g.rowsWritten)}</td>
                      <td>{number(g.queries)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className="muted">
        {current.scope} The displayed remainder is not a guarantee of remaining
        Cloudflare allowance. Confirm account-wide totals in Cloudflare →
        Workers &amp; Pages → Durable Objects → Metrics.
      </p>
    </section>
  );
}
