import { useEffect, useState } from "react";
import { GENRES, FORMAT_OPTIONS, LENGTH_OPTIONS } from "../lib/preferences.js";
const when = (v) => (v ? new Date(v).toLocaleString() : "Not recorded");
const number = (v) => Number(v || 0).toLocaleString();
const actionLabel = {
  good: "Good",
  bad: "Bad",
  watch: "Would Watch",
  nope: "Won’t Watch",
};
const save = (data, filename) => {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
};
function Table({ columns, rows, empty = "No data recorded yet." }) {
  return (
    <div className="admin-table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map(([label]) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map(([label, field]) => (
                <td key={label}>
                  {typeof field === "function"
                    ? field(row)
                    : (row[field] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="muted">{empty}</p>}
    </div>
  );
}
function Stats({ values }) {
  return (
    <div className="admin-stats">
      {values.map(([label, value]) => (
        <div key={label}>
          <strong>{number(value)}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
function Audit({ rows }) {
  return (
    <Table
      rows={rows}
      columns={[
        ["When", (r) => when(r.at)],
        ["Action", "action"],
        ["Actor", "actor"],
        ["Account", "target"],
        ["Reason", "reason"],
      ]}
    />
  );
}
export function AdminOperations({ section, api, currentAccount }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState("all"),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState(null);
  const [action, setAction] = useState("preferences"),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(""),
    [username, setUsername] = useState(""),
    [preferences, setPreferences] = useState({});
  const [probe, setProbe] = useState(""),
    [simulation, setSimulation] = useState(null),
    [reactionFilter, setReactionFilter] = useState("all");
  async function work(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh(page = offset) {
    const path =
      section === "accounts"
        ? `/api/admin/accounts?q=${encodeURIComponent(q)}&status=${filter}&offset=${page}`
        : section === "guests"
          ? `/api/admin/guests?offset=${page}`
          : `/api/admin/${section}`;
    setData(await api(path));
    setOffset(page);
  }
  useEffect(() => {
    let live = true;
    setData(null);
    setSelected(null);
    setError("");
    setOffset(0);
    setBusy(true);
    const path =
      section === "accounts" ? "/api/admin/accounts" : `/api/admin/${section}`;
    api(path)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [section]);
  async function inspect(id) {
    const d = await api(`/api/admin/account?id=${encodeURIComponent(id)}`);
    setSelected(d);
    setAction("preferences");
    setUsername(d.account.username);
    setPreferences(d.account.preferences);
    setConfirm("");
    setReason("");
    setSimulation(null);
  }
  const toggle = (field, item) =>
    setPreferences((p) => ({
      ...p,
      [field]: (p[field] || []).includes(item)
        ? p[field].filter((x) => x !== item)
        : [...(p[field] || []), item],
    }));
  return (
    <div className="admin-operations">
      {error && (
        <p className="admin-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      <div className="admin-heading">
        <h2>
          {section === "overview"
            ? "Site overview"
            : section === "accounts"
              ? "Accounts & tastes"
              : section === "guests"
                ? "Guest browsers & tastes"
                : "Algorithm diagnostics"}
        </h2>
        <button
          className="soft-button"
          disabled={busy}
          onClick={() => work(() => refresh())}
        >
          Refresh {section}
        </button>
      </div>
      {busy && <p role="status">Loading…</p>}
      {data && section === "overview" && (
        <>
          <Stats
            values={[
              ["Accounts", data.accounts],
              ["Active accounts today", data.activeToday],
              ["Active accounts · 30 days", data.active30Days],
              ["New accounts · 30 days", data.new30Days],
              ["Suspended", data.suspended],
              ["API requests · 30 days", data.totals.requests],
              ["Guest browser profiles", data.guests],
              ["Active guest browsers today", data.activeGuestsToday],
              ["Active guest browsers · 30 days", data.activeGuests30Days],
              [
                "Returning guest browsers · 30 days",
                data.returningGuests30Days,
              ],
              ["Guests completing onboarding", data.onboardedGuests],
            ]}
          />
          <p className="muted">
            Recording began {when(data.startedAt)}.{" "}
            {data.collectionEnabled
              ? "Analytics collection is enabled."
              : "Analytics collection is disabled."}{" "}
            Requests are API calls, not page views or people. Active accounts
            are distinct signed-in accounts using account APIs. Guest browsers
            retain a random browser ID and their full local profile; up to 1,000
            latest choices and viewing preferences are reported for owner
            diagnostics. Returning means activity on more than one UTC day.
            Browser counts are not counts of people. Older activity cannot be
            reconstructed.
          </p>
          <div className="admin-columns">
            <section className="admin-panel">
              <h3>Daily API activity</h3>
              <div className="admin-sparkbars" aria-label="Daily API requests">
                {data.days.map((d) => (
                  <div
                    key={d.day}
                    title={`${new Date(d.day * 86400000).toISOString().slice(0, 10)}: ${d.requests} requests, ${d.errors} errors`}
                  >
                    <span
                      style={{
                        height: `${Math.max(2, (100 * d.requests) / Math.max(1, ...data.days.map((x) => x.requests)))}%`,
                      }}
                    />
                    <small>{new Date(d.day * 86400000).getUTCDate()}</small>
                  </div>
                ))}
              </div>
              <p>
                {number(data.totals.errors)} failed API requests ·{" "}
                {Math.round(data.totals.averageMs)} ms average response time.
              </p>
              <Table
                rows={data.reactions}
                columns={[
                  [
                    "Current reaction",
                    (r) => actionLabel[r.action] || r.action,
                  ],
                  ["Saved choices", (r) => number(r.count)],
                ]}
              />
            </section>
            <section className="admin-panel">
              <h3>Where requests come from</h3>
              <Table
                rows={data.countries}
                columns={[
                  ["Country", "country"],
                  ["Requests", (r) => number(r.requests)],
                  ["Errors", (r) => number(r.errors)],
                ]}
              />
              <p className="muted">
                Cloudflare IP geolocation is approximate. VPNs, shared networks
                and mobile routing can change it. It does not establish
                residence or identity.
              </p>
            </section>
          </div>
          <section className="admin-panel">
            <h3>API health</h3>
            <Table
              rows={data.routes}
              columns={[
                ["Route group", "route"],
                ["Requests", (r) => number(r.requests)],
                ["Errors", (r) => number(r.errors)],
                ["Average ms", (r) => Math.round(r.averageMs)],
              ]}
            />
            <button
              className="soft-button"
              onClick={() =>
                save(
                  {
                    exportedAt: new Date().toISOString(),
                    days: data.days,
                    countries: data.countries,
                    routes: data.routes,
                    reactions: data.reactions,
                    reactionCohorts: data.reactionCohorts,
                    guestBrowsers: {
                      total: data.guests,
                      activeToday: data.activeGuestsToday,
                      active30Days: data.activeGuests30Days,
                      returning30Days: data.returningGuests30Days,
                    },
                  },
                  "anime-shuffle-analytics.json",
                )
              }
            >
              Export aggregate analytics
            </button>
          </section>
          <section className="admin-panel">
            <h3>Admin activity</h3>
            <Audit rows={data.history} />
            <p className="muted">
              Account inspection and changes are audited. Latest IP/location:{" "}
              {data.retention.networkDays} days; aggregate activity:{" "}
              {data.retention.aggregateDays} days; admin audit:{" "}
              {data.retention.auditDays} days. Credentials and session tokens
              are never shown.
            </p>
          </section>
        </>
      )}
      {data && section === "guests" && (
        <>
          <Stats values={[["Guest browser profiles", data.total]]} />
          <p className="muted">
            Guest profiles are anonymous, self-reported browser snapshots. Their
            full preferences and history remain in the browser. Clearing browser
            storage starts a new identity. Guest accounts cannot be edited
            remotely through this page.
          </p>
          <Table
            rows={data.guests}
            columns={[
              [
                "Browser",
                (g) => (
                  <button
                    className="soft-button"
                    disabled={busy}
                    onClick={() =>
                      work(async () =>
                        setSelected(
                          await api(
                            `/api/admin/guest?id=${encodeURIComponent(g.id)}`,
                          ),
                        ),
                      )
                    }
                  >
                    Guest {g.id.slice(6, 14)}
                  </button>
                ),
              ],
              ["First observed", (g) => when(g.firstSeen)],
              ["Last active", (g) => when(g.lastSeen)],
              ["Country", "country"],
              ["Onboarded", (g) => (g.onboardingComplete ? "Yes" : "No")],
              ["Reported choices", "totalReactions"],
              ["Stored for diagnostics", "storedReactions"],
            ]}
          />
          <div className="admin-actions">
            <button
              className="soft-button"
              disabled={busy || offset === 0}
              onClick={() => work(() => refresh(Math.max(0, offset - 50)))}
            >
              Previous guest page
            </button>
            <button
              className="soft-button"
              disabled={busy || !data.hasMore}
              onClick={() => work(() => refresh(offset + 50))}
            >
              Next guest page
            </button>
          </div>
          {selected?.guest && (
            <>
              <section className="admin-panel">
                <h3>Guest {selected.guest.id.slice(6, 14)}</h3>
                <p className="muted">{selected.scope}</p>
                <p>
                  {selected.reactions.length} stored of{" "}
                  {selected.guest.totalReactions} reported choices.
                </p>
                <h4>Latest network observation</h4>
                <p>
                  {selected.network
                    ? `${selected.network.ip || "IP unavailable"} · ${selected.network.country} · ${selected.network.region || "Region unavailable"} · ${selected.network.city || "City unavailable"} · ${when(selected.network.observedAt)}`
                    : "No retained network observation."}
                </p>
                <details>
                  <summary>All reported viewing preferences</summary>
                  <pre>{JSON.stringify(selected.preferences, null, 2)}</pre>
                </details>
                <button
                  className="soft-button"
                  onClick={() =>
                    save(
                      selected,
                      `anime-shuffle-guest-${selected.guest.id.slice(6, 14)}.json`,
                    )
                  }
                >
                  Export guest snapshot
                </button>
              </section>
              <section className="admin-panel">
                <h3>Guest taste evidence</h3>
                <div className="admin-taste-grid">
                  {[
                    ["Supported interests", selected.taste.interests],
                    [
                      "Curiosity, not confirmed enjoyment",
                      selected.taste.curious,
                    ],
                    ["Mixed reactions", selected.taste.contrasts],
                  ].map(([title, groups]) => (
                    <div key={title}>
                      <h4>{title}</h4>
                      {!groups.length && <p>Not enough evidence yet.</p>}
                      {groups.map((g) => (
                        <details key={g.key}>
                          <summary>{g.label}</summary>
                          {[...g.liked, ...g.disliked, ...g.curious]
                            .slice(0, 12)
                            .map((e, i) => (
                              <p key={i}>
                                {e.anime.englishTitle || e.anime.title} —{" "}
                                {e.evidence}
                              </p>
                            ))}
                        </details>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
              <section className="admin-panel">
                <h3>Reported reactions & watchlist</h3>
                <Table
                  rows={selected.reactions}
                  columns={[
                    ["Anime", (r) => r.anime.englishTitle || r.anime.title],
                    ["MAL ID", "id"],
                    ["Choice", (r) => actionLabel[r.action]],
                    ["Reason", (r) => r.reason || "Not provided"],
                    ["Saved", (r) => when(r.at)],
                  ]}
                />
              </section>
            </>
          )}
        </>
      )}
      {data && section === "accounts" && (
        <>
          <form
            className="admin-account-search"
            onSubmit={(e) => {
              e.preventDefault();
              void work(() => refresh(0));
            }}
          >
            <label>
              Find an account
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Username or account ID"
              />
            </label>
            <label>
              Status
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All accounts</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <button className="soft-button" disabled={busy}>
              Search accounts
            </button>
          </form>
          <p>{number(data.total)} matching accounts</p>
          <Table
            rows={data.accounts}
            columns={[
              [
                "Account",
                (r) => (
                  <button
                    className="admin-text-button"
                    onClick={() => work(() => inspect(r.id))}
                  >
                    {r.username}
                  </button>
                ),
              ],
              ["Login", "provider"],
              [
                "Status",
                (r) =>
                  r.suspended
                    ? "Suspended"
                    : r.administrator
                      ? "Owner"
                      : "Active",
              ],
              ["Last seen", (r) => when(r.lastSeen)],
              [
                "Saved choices",
                (r) =>
                  r.reactionCounts
                    .map((c) => `${actionLabel[c.action]} ${c.count}`)
                    .join(" · ") || "None",
              ],
            ]}
          />
          <div className="admin-actions">
            <button
              className="soft-button"
              disabled={busy || !offset}
              onClick={() => work(() => refresh(Math.max(0, offset - 50)))}
            >
              Previous accounts
            </button>
            <button
              className="soft-button"
              disabled={busy || offset + 50 >= data.total}
              onClick={() => work(() => refresh(offset + 50))}
            >
              Next accounts
            </button>
          </div>
          {selected && (
            <section
              className="admin-account-detail"
              aria-label="Selected account"
            >
              <div className="admin-heading">
                <h3>{selected.account.username}</h3>
                <button
                  className="soft-button"
                  disabled={busy}
                  onClick={() => work(() => inspect(selected.account.id))}
                >
                  Reload account
                </button>
              </div>
              <code className="admin-account-id">{selected.account.id}</code>
              <div className="admin-columns">
                <section className="admin-panel">
                  <h3>Account information</h3>
                  <dl className="admin-diagnostics">
                    {[
                      ["Login provider", selected.account.provider],
                      ["Account created", when(selected.account.createdAt)],
                      ["First observed", when(selected.account.firstSeen)],
                      ["Last seen", when(selected.account.lastSeen)],
                      ["MAL ID", selected.account.malId || "Not linked"],
                      [
                        "Onboarding",
                        selected.account.onboardingComplete
                          ? "Complete"
                          : "Incomplete",
                      ],
                      [
                        "Status",
                        selected.account.suspended ? "Suspended" : "Active",
                      ],
                      [
                        "Auto-add to MAL",
                        selected.account.settings.autoAdd ? "On" : "Off",
                      ],
                      [
                        "Dynamic theme",
                        selected.account.settings.dynamic === false
                          ? "Off"
                          : "On",
                      ],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <section className="admin-panel">
                  <h3>Latest network observation</h3>
                  {selected.network ? (
                    <>
                      <dl className="admin-diagnostics">
                        {[
                          ["IP address", selected.network.ip || "Unavailable"],
                          ["Country", selected.network.country],
                          ["Region", selected.network.region || "Unavailable"],
                          [
                            "City (approximate)",
                            selected.network.city || "Unavailable",
                          ],
                          [
                            "Timezone",
                            selected.network.timezone || "Unavailable",
                          ],
                          ["Observed", when(selected.network.observedAt)],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="muted">
                        Latest observation only. Location is approximate and is
                        not used to infer tastes.
                      </p>
                    </>
                  ) : (
                    <p>
                      No retained network observation. Data appears after the
                      account uses the site and expires after 30 days.
                    </p>
                  )}
                </section>
              </div>
              <section className="admin-panel">
                <h3>Taste evidence</h3>
                <p className="muted">{selected.scope}</p>
                {selected.warnings.map((w) => (
                  <p key={w} className="admin-notice">
                    {w}
                  </p>
                ))}
                <div className="admin-taste-grid">
                  {[
                    ["Supported interests", selected.taste.interests],
                    [
                      "Curiosity, not confirmed enjoyment",
                      selected.taste.curious,
                    ],
                    ["Mixed reactions", selected.taste.contrasts],
                  ].map(([title, groups]) => (
                    <div key={title}>
                      <h4>{title}</h4>
                      {!groups.length && (
                        <p className="muted">Not enough evidence yet.</p>
                      )}
                      {groups.map((g) => (
                        <details key={g.key}>
                          <summary>{g.label}</summary>
                          {[...g.liked, ...g.disliked, ...g.curious]
                            .slice(0, 12)
                            .map((e, i) => (
                              <p key={i}>
                                {e.anime.englishTitle || e.anime.title} —{" "}
                                {e.evidence}
                              </p>
                            ))}
                        </details>
                      ))}
                    </div>
                  ))}
                </div>
                <Table
                  rows={selected.genres.slice(0, 20)}
                  columns={[
                    ["Genre", "name"],
                    ["Observed signal", (r) => r.signal.toFixed(3)],
                    ["Supporting examples", "examples"],
                  ]}
                />
                <p className="muted">
                  Signals are weighted evidence, not confidence percentages.
                  Genre counts overlap.
                </p>
              </section>
              <section className="admin-panel">
                <h3>Saved reactions & watchlist</h3>
                <label>
                  Show
                  <select
                    value={reactionFilter}
                    onChange={(e) => setReactionFilter(e.target.value)}
                  >
                    <option value="all">All reactions</option>
                    {Object.entries(actionLabel).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {selected.reactions.length} loaded of{" "}
                  {number(selected.totalReactions)} saved choices. Would Watch
                  entries are the site watchlist.
                </p>
                <Table
                  rows={selected.reactions.filter(
                    (r) =>
                      reactionFilter === "all" || r.action === reactionFilter,
                  )}
                  columns={[
                    [
                      "Anime",
                      (r) =>
                        r.anime?.englishTitle ||
                        r.anime?.title ||
                        `MAL ${r.id}`,
                    ],
                    ["MAL ID", "id"],
                    ["Choice", (r) => actionLabel[r.action]],
                    ["Reason", (r) => r.reason || "Not provided"],
                    ["Saved", (r) => when(r.at)],
                  ]}
                />
                {selected.truncated && (
                  <button
                    className="soft-button"
                    disabled={busy}
                    onClick={() =>
                      work(async () => {
                        const page = await api(
                          `/api/admin/account/reactions?id=${encodeURIComponent(selected.account.id)}&offset=${selected.reactions.length}`,
                        );
                        setSelected((s) => ({
                          ...s,
                          reactions: [...s.reactions, ...page.reactions],
                          truncated: page.hasMore,
                        }));
                      })
                    }
                  >
                    Load more reactions
                  </button>
                )}
              </section>
              <section className="admin-panel">
                <h3>Inspect a recommendation</h3>
                <p className="muted">
                  Run the current scoring code on stored evidence without
                  changing the account or its live recommendations.
                </p>
                <form
                  className="admin-actions"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void work(async () =>
                      setSimulation(
                        await api("/api/admin/simulate", {
                          id: selected.account.id,
                          animeId: Number(probe),
                        }),
                      ),
                    );
                  }}
                >
                  <label>
                    Candidate MAL ID
                    <input
                      type="number"
                      min="1"
                      value={probe}
                      onChange={(e) => setProbe(e.target.value)}
                      required
                    />
                  </label>
                  <button className="soft-button" disabled={busy}>
                    Explain candidate
                  </button>
                </form>
                {simulation && (
                  <>
                    <h4>{simulation.candidate.title}</h4>
                    <p>
                      Match score {simulation.result.score.toFixed(3)} ·
                      enjoyment {simulation.result.enjoyment.toFixed(3)} ·
                      interest {simulation.result.interest.toFixed(3)}
                    </p>
                    <p>
                      {simulation.passesFilters
                        ? "Passes the stored viewing filters"
                        : "Excluded by stored viewing filters"}
                      {simulation.alreadyReacted ? " · Already reacted to" : ""}{" "}
                      · {simulation.trainingCount} training records
                    </p>
                    <Table
                      rows={simulation.contributions}
                      columns={[
                        ["Feature", "key"],
                        [
                          "Score contribution",
                          (r) => r.contribution.toFixed(5),
                        ],
                      ]}
                    />
                    <p className="muted">{simulation.scope}</p>
                  </>
                )}
              </section>
              <section className="admin-panel">
                <h3>Manage this account</h3>
                <p>
                  Changes require a reason and account ID confirmation.
                  Suspension preserves data; restore re-enables login. Revoking
                  sessions signs out existing devices. Username changes affect
                  local login. No action changes a MAL password or MAL list.
                </p>
                <label>
                  Action
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                  >
                    <option value="preferences">
                      Edit viewing preferences
                    </option>
                    {selected.account.provider === "local" && (
                      <option value="rename">Change username</option>
                    )}
                    <option value="revoke-sessions">
                      Sign out all sessions
                    </option>
                    <option value="reset-onboarding">
                      Show onboarding again
                    </option>
                    {!selected.account.administrator &&
                      selected.account.id !== currentAccount && (
                        <option
                          value={
                            selected.account.suspended ? "restore" : "suspend"
                          }
                        >
                          {selected.account.suspended
                            ? "Restore account"
                            : "Suspend account"}
                        </option>
                      )}
                  </select>
                </label>
                {action === "rename" && (
                  <label>
                    New login username
                    <input
                      value={username}
                      maxLength={24}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </label>
                )}
                {action === "preferences" && (
                  <div className="admin-preference-editor">
                    <fieldset>
                      <legend>Genres (none means any)</legend>
                      {GENRES.map((g) => (
                        <label key={g}>
                          <input
                            type="checkbox"
                            checked={(
                              preferences.favoriteGenres || []
                            ).includes(g)}
                            onChange={() => toggle("favoriteGenres", g)}
                          />
                          {g}
                        </label>
                      ))}
                    </fieldset>
                    <fieldset>
                      <legend>Formats</legend>
                      {FORMAT_OPTIONS.map((f) => (
                        <label key={f.id}>
                          <input
                            type="checkbox"
                            checked={(preferences.formats || []).includes(f.id)}
                            onChange={() => toggle("formats", f.id)}
                          />
                          {f.label}
                        </label>
                      ))}
                    </fieldset>
                    <fieldset>
                      <legend>Series lengths</legend>
                      {LENGTH_OPTIONS.map((f) => (
                        <label key={f.id}>
                          <input
                            type="checkbox"
                            checked={(preferences.lengths || []).includes(f.id)}
                            onChange={() => toggle("lengths", f.id)}
                          />
                          {f.label}
                        </label>
                      ))}
                    </fieldset>
                    {[
                      ["finishedOnly", "Finished titles only"],
                      ["includeUnknown", "Include unknown lengths"],
                      ["includeNsfw", "Include mature content"],
                      ["includeNonCanonMovies", "Include non-canon movies"],
                    ].map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={!!preferences[key]}
                          onChange={(e) =>
                            setPreferences((p) => ({
                              ...p,
                              [key]: e.target.checked,
                            }))
                          }
                        />
                        {label}
                      </label>
                    ))}
                    <label>
                      Children’s titles
                      <select
                        value={preferences.childrenTitles || "hide"}
                        onChange={(e) =>
                          setPreferences((p) => ({
                            ...p,
                            childrenTitles: e.target.value,
                          }))
                        }
                      >
                        <option value="hide">Hide</option>
                        <option value="include">
                          Include when supported by taste
                        </option>
                      </select>
                    </label>
                    <div className="admin-actions">
                      {[
                        ["scoreMin", "Minimum MAL score"],
                        ["scoreMax", "Maximum MAL score"],
                      ].map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            type="number"
                            min="1"
                            max="10"
                            step="0.1"
                            value={preferences[key] ?? ""}
                            onChange={(e) =>
                              setPreferences((p) => ({
                                ...p,
                                [key]:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <p>
                      Initial favorites:{" "}
                      {(preferences.favoriteAnime || [])
                        .map((a) => a.englishTitle || a.title)
                        .join(", ") || "None"}
                      . Favorites and saved reactions are preserved.
                    </p>
                  </div>
                )}
                <label>
                  Reason for change
                  <textarea
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <label>
                  Confirm account ID
                  <input
                    autoComplete="off"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={selected.account.id}
                  />
                </label>
                <button
                  className="soft-button admin-danger"
                  disabled={
                    busy ||
                    reason.trim().length < 3 ||
                    confirm !== selected.account.id
                  }
                  onClick={() =>
                    work(async () => {
                      await api("/api/admin/account/action", {
                        id: selected.account.id,
                        expectedVersion: selected.account.version,
                        action,
                        username,
                        preferences,
                        reason,
                        confirm,
                      });
                      await inspect(selected.account.id);
                      await refresh();
                      setNotice(
                        "Account updated. The change is recorded in the audit trail.",
                      );
                    })
                  }
                >
                  Apply account change
                </button>
              </section>
              <section className="admin-panel">
                <h3>Account audit history</h3>
                <Audit
                  rows={selected.history.map((h) => ({
                    ...h,
                    target: selected.account.id,
                  }))}
                />
                {selected.history
                  .filter(
                    (h) =>
                      h.action === "preferences" &&
                      h.detail?.before?.preferences,
                  )
                  .map((h) => (
                    <button
                      key={h.id}
                      className="soft-button"
                      onClick={() => {
                        setPreferences(h.detail.before.preferences);
                        setAction("preferences");
                        setNotice(
                          "Previous preferences loaded into the editor. Confirm and apply to restore them.",
                        );
                      }}
                    >
                      Load preferences before {when(h.at)}
                    </button>
                  ))}
              </section>
            </section>
          )}
        </>
      )}
      {data && section === "algorithm" && (
        <>
          <Stats
            values={[
              ["Stored reactions", data.totalReactions],
              [
                "Signed-in reactions",
                data.cohortCounts?.find((c) => c.cohort === "account")?.count,
              ],
              [
                "Guest reactions",
                data.cohortCounts?.find((c) => c.cohort === "guest")?.count,
              ],
              ["Guest browsers with partial history", data.truncatedGuests],
              [
                "Accounts with fewer than 10 reactions",
                data.lowEvidenceAccounts,
              ],
              ["Owner research profiles", data.research.profiles],
              ["Automatic profiles", data.modelProfiles],
              ["Catalog awaiting owner research", data.research.pending],
              ["Changed research inputs", data.research.stale],
            ]}
          />
          <section className="admin-panel">
            <h3>How to read this</h3>
            {data.limitations.map((x) => (
              <p key={x}>{x}</p>
            ))}
            <p>
              Genre/reason summaries use {number(data.sampleSize)} saved
              reactions
              {data.totalReactions > data.sampleSize
                ? " (bounded sample, not the full dataset)"
                : ""}
              . Inspect an account and candidate for feature-level scoring
              evidence.
            </p>
          </section>
          <section className="admin-panel">
            <h3>Genre response patterns</h3>
            <Table
              rows={data.genres}
              columns={[
                ["Genre", "genre"],
                ["Good", "good"],
                ["Bad", "bad"],
                ["Would Watch", "watch"],
                ["Won’t Watch", "nope"],
              ]}
            />
          </section>
          <div className="admin-columns">
            <section className="admin-panel">
              <h3>Reasons users provide</h3>
              <Table
                rows={data.reasons}
                columns={[
                  ["Reason", "reason"],
                  ["Count", "count"],
                ]}
              />
            </section>
            <section className="admin-panel">
              <h3>Useful next investigations</h3>
              <ul>
                <li>
                  Compare high-disagreement titles with their research evidence.
                </li>
                <li>
                  Check whether weak matches lack synopsis, review or research
                  attributes.
                </li>
                <li>
                  Use account-level diagnostics to separate enjoyment from watch
                  interest.
                </li>
                <li>
                  Compare a prospective algorithm change against held-out
                  reactions before changing production weights.
                </li>
              </ul>
            </section>
          </div>
          <section className="admin-panel">
            <h3>Most-reacted-to titles</h3>
            <Table
              rows={data.titles}
              columns={[
                ["Title", "title"],
                ["Good", "good"],
                ["Bad", "bad"],
                ["Would Watch", "watch"],
                ["Won’t Watch", "nope"],
                ["Total", "votes"],
              ]}
            />
          </section>
        </>
      )}
    </div>
  );
}
