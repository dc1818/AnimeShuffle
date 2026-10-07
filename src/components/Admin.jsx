import {
  splitResearchUpload,
  previewResearchUpload,
} from "../lib/research-upload.js";
import { AdminOperations } from "./AdminOperations.jsx";
import { useEffect, useState } from "react";

const download = (data, name) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const when = (value) =>
  new Date(value).toLocaleString(undefined, { timeZoneName: "short" });

/** Standalone owner workspace: it does not initialize the discovery store,
 * fetch private MAL lists, or start model inference while the owner works. */
export function Admin() {
  const [section, setSection] = useState("overview");
  const [session, setSession] = useState(null),
    [status, setStatus] = useState(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [bundle, setBundle] = useState(null),
    [importProgress, setImportProgress] = useState(null),
    [report, setReport] = useState(null);
  const [kind, setKind] = useState("pending"),
    [cursor, setCursor] = useState(0),
    [page, setPage] = useState(null);
  const [profileSource, setProfileSource] = useState("profiles");
  const [revealedProfiles, setRevealedProfiles] = useState(new Set());
  const [questionLabel, setQuestionLabel] = useState("");
  const [questionArea, setQuestionArea] = useState("characters");
  const [questionKey, setQuestionKey] = useState("");
  const [coverageAudit, setCoverageAudit] = useState(null);
  const [auditCursor, setAuditCursor] = useState(0);
  const [profiles, setProfiles] = useState([]),
    [profileCursor, setProfileCursor] = useState(null),
    [filter, setFilter] = useState("");
  async function api(path, body, active = session) {
    const r = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      ...(body
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": active.csrf,
            },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || `Request failed (${r.status}).`);
    return data;
  }
  async function reload(active = session) {
    setRevealedProfiles(new Set());
    const [s, p] = await Promise.all([
      api("/api/admin/status", null, active),
      api(`/api/admin/export?kind=${profileSource}&limit=100`, null, active),
    ]);
    setStatus(s);
    setProfiles(p.profiles);
    setProfileCursor(p.nextCursor);
  }
  useEffect(() => {
    let live = true;
    fetch("/api/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw Error("Could not load your session.");
        const s = await r.json();
        if (!live) return;
        setSession(s);
        if (s.admin) await reload(s);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
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
  const exportPage = () =>
    work(async () => {
      const data = await api(
        `/api/admin/export?kind=${kind}&after=${cursor}&limit=25`,
      );
      setPage(data);
      download(data, `anime-shuffle-${kind}-${cursor}.json`);
      setNotice(
        `Exported ${["profiles", "automatic"].includes(kind) ? data.profiles.length : data.catalog.length} titles. Export files can contain private research spoilers. ${data.nextCursor === null ? "This is the last page." : "Use Next batch to continue."}`,
      );
    });
  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setBundle(null);
    setReport(null);
    setImportProgress(null);
    if (!file) return;
    void work(async () => {
      if (
        !/\.json$/i.test(file.name) ||
        (file.type && !["application/json", "text/plain"].includes(file.type))
      )
        throw Error(
          "Choose a JSON research file. Large files are sent in smaller requests.",
        );
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw Error("The file is not valid JSON.");
      }
      const chunks = splitResearchUpload(data);
      const preview = await previewResearchUpload(chunks, api, (done, total) =>
        setNotice(`Validating ${done} of ${total} chunks…`),
      );
      setBundle({
        chunks,
        key: crypto.randomUUID(),
        completed: 0,
        revision: preview.revision,
      });
      setReport(preview);
      setNotice("File validated. Review the titles before importing.");
    });
  };
  return (
    <main className="admin-workspace">
      <header className="admin-header">
        <a href="/" className="admin-brand">
          <img src="/assets/logo.png" alt="Anime Shuffle" />
        </a>
        <div>
          <span className="eyebrow">OWNER WORKSPACE</span>
          <h1>Administration</h1>
        </div>
        <a className="soft-button" href="/">
          Back to Anime Shuffle
        </a>
      </header>
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
      {!session && !error && <p role="status">Checking your session…</p>}
      {session && !session.admin && (
        <section className="admin-panel">
          <h2>Administrator access</h2>
          {!session.account ? (
            <>
              <p>
                Sign in with your existing Anime Shuffle or MyAnimeList account,
                then return here.
              </p>
              <a href="/" className="soft-button">
                Go to sign in
              </a>
            </>
          ) : (
            <>
              <p>
                Signed in as <strong>{session.account.name}</strong>. This
                account has not been granted administrator access.
              </p>
              <p>
                In your Cloudflare Worker’s Settings → Variables and Secrets,
                add a Secret named <code>ADMIN_ACCOUNT_IDS</code> with the
                account ID below, then deploy. Only someone with access to your
                hosting settings can grant this permission.
              </p>
              <code className="admin-account-id">{session.account.id}</code>
              <p>
                Refresh this page after saving the setting. Do not use your
                username or MAL client ID.
              </p>
            </>
          )}
        </section>
      )}
      {session?.admin && !status && (
        <p role="status">Loading research coverage…</p>
      )}
      {session?.admin && status && (
        <>
          {status.operationsAvailable && (
            <nav className="admin-tabs" aria-label="Admin sections">
              {[
                ["overview", "Overview"],
                ["accounts", "Accounts & tastes"],
                ["guests", "Guest browsers"],
                ["algorithm", "Algorithm"],
                ["research", "Anime research"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={section === key ? "active" : ""}
                  aria-pressed={section === key}
                  onClick={() => setSection(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
          {status.operationsAvailable && section !== "research" && (
            <AdminOperations
              key={section}
              section={section}
              api={api}
              currentAccount={session.account.id}
            />
          )}
          <div
            className="admin-research-section"
            hidden={status.operationsAvailable && section !== "research"}
          >
            <div className="admin-heading">
              <p>
                Signed in as <strong>{session.account.name}</strong>. Shared
                profiles help every user; they do not contain personal taste
                histories.
              </p>
              <button
                className="soft-button"
                disabled={busy}
                onClick={() => work(() => reload())}
              >
                Refresh status
              </button>
            </div>
            <section className="admin-stats" aria-label="Analysis coverage">
              {[
                ["Known titles", status.catalog],
                ["Stored profiles", status.profiles],
                ["Awaiting analysis", status.pending],
                ["Preliminary", status.preliminary],
                ["Changed inputs", status.stale],
              ].map(([label, value]) => (
                <div key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </section>
            <section className="admin-panel">
              <h2>New tastes & missing research</h2>
              <p>
                Register a specific research question, then audit which stored
                profiles explicitly address it. Questions are included in
                exports for analysis here and in future Cloudflare prompts.
                Saving a question queues a new analysis pass. It does not add a
                ranking rule automatically.
              </p>
              <form
                className="admin-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  void work(async () => {
                    const key = questionKey.trim();
                    await api("/api/admin/research/requirements", {
                      expectedDigest: status.requirementsDigest,
                      requirements: [
                        ...(status.requirements || []).filter(
                          (r) => r.key !== key,
                        ),
                        {
                          key,
                          label: questionLabel.trim(),
                          area: questionArea,
                          traitKey: null,
                          dimensionKey: key,
                        },
                      ],
                    });
                    setCoverageAudit(null);
                    setAuditCursor(0);
                    await reload();
                    setNotice(
                      "Research question saved. Missing evidence will stay unknown until supported analysis is available.",
                    );
                  });
                }}
              >
                <label>
                  What should future analysis establish?
                  <input
                    value={questionLabel}
                    maxLength={200}
                    required
                    onChange={(e) => setQuestionLabel(e.target.value)}
                    placeholder="How does the villain's motivation change?"
                  />
                </label>
                <label>
                  Research area
                  <select
                    value={questionArea}
                    onChange={(e) => setQuestionArea(e.target.value)}
                  >
                    {(status.researchAreas || []).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Stable dimension key
                  <input
                    value={questionKey}
                    maxLength={80}
                    pattern="[a-z][a-z0-9-]*"
                    required
                    onChange={(e) => setQuestionKey(e.target.value)}
                    placeholder="villain-motive-development"
                  />
                </label>
                <button
                  className="soft-button"
                  disabled={busy || !status.requirementsDigest}
                >
                  Save research question
                </button>
              </form>
              <ul>
                {(status.requirements || []).map((r) => (
                  <li key={r.key}>
                    {r.label} · {r.area} · {r.dimensionKey || r.traitKey}
                  </li>
                ))}
              </ul>
              <div className="admin-actions">
                <button
                  className="soft-button"
                  disabled={busy || !(status.requirements || []).length}
                  onClick={() =>
                    work(async () => {
                      setAuditCursor(0);
                      setCoverageAudit(
                        await api("/api/admin/research/audit?limit=25"),
                      );
                    })
                  }
                >
                  Check first 25 titles
                </button>
                <button
                  className="soft-button"
                  disabled={busy || coverageAudit?.nextCursor == null}
                  onClick={() =>
                    work(async () => {
                      const after = coverageAudit.nextCursor;
                      setAuditCursor(after);
                      setCoverageAudit(
                        await api(
                          `/api/admin/research/audit?after=${after}&limit=25`,
                        ),
                      );
                    })
                  }
                >
                  Next coverage page
                </button>
                <button
                  className="soft-button"
                  disabled={!coverageAudit}
                  onClick={() =>
                    download(
                      coverageAudit,
                      `anime-shuffle-research-gaps-${auditCursor}.json`,
                    )
                  }
                >
                  Export coverage & gaps
                </button>
              </div>
              {coverageAudit && (
                <>
                  <p className="muted">{coverageAudit.instructions}</p>
                  <div className="admin-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Anime</th>
                          <th>Research question</th>
                          <th>Evidence status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coverageAudit.titles.flatMap((t) =>
                          t.requirements.map((r) => (
                            <tr key={`${t.malId}:${r.key}`}>
                              <td>
                                {t.title} · #{t.malId}
                              </td>
                              <td>{r.label}</td>
                              <td>{r.state}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
            <p className="muted">
              Known titles are those this deployment has encountered, not the
              full MAL database. Imported profiles do not expire. Preliminary
              profiles need deeper research; changed inputs need reassessment.
              New evidence is used for future picks without replacing a loaded
              card or shortlist.
            </p>
            <div className="admin-columns">
              <section className="admin-panel">
                <h2>Export for analysis</h2>
                <p>
                  Download public catalog inputs with the vocabulary and
                  research checklist. Export stored profiles for backups or
                  revisions.
                </p>
                <label>
                  Export contents
                  <select
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value);
                      setCursor(0);
                      setPage(null);
                    }}
                  >
                    <option value="pending">
                      Unanalysed or changed titles
                    </option>
                    <option value="automatic">Automatic model profiles</option>
                    <option value="catalog">All known catalog titles</option>
                    <option value="profiles">Stored research profiles</option>
                  </select>
                </label>
                <div className="admin-actions">
                  <button
                    className="soft-button"
                    disabled={busy}
                    onClick={() =>
                      work(async () => {
                        await api("/api/catalog?source=popular&offset=0");
                        await reload();
                        setNotice(
                          "Collected the first popular catalog page. Public metadata is ready to export.",
                        );
                      })
                    }
                  >
                    Collect popular titles
                  </button>
                  <button
                    className="soft-button"
                    disabled={busy}
                    onClick={exportPage}
                  >
                    Export 25 titles · private JSON
                  </button>
                  <button
                    className="soft-button"
                    disabled={busy || page?.nextCursor == null}
                    onClick={() => {
                      setCursor(page.nextCursor);
                      setPage(null);
                    }}
                  >
                    Next batch
                  </button>
                  {cursor > 0 && (
                    <button
                      className="soft-button"
                      onClick={() => {
                        setCursor(0);
                        setPage(null);
                      }}
                    >
                      Start over
                    </button>
                  )}
                </div>
                <small>
                  Starting after MAL ID {cursor}. Export each page to back up
                  the entire collection.
                </small>
              </section>
              <section className="admin-panel">
                <h2>Import analysis</h2>
                <p>
                  Choose an Anime Shuffle research JSON file. Validation checks
                  IDs, evidence, vocabulary, scores and versions before any data
                  is changed.
                </p>
                <label className="admin-file">
                  Research JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={chooseFile}
                    disabled={busy}
                  />
                </label>
                {report && (
                  <>
                    <p>
                      {report.newProfiles} new · {report.replacements}{" "}
                      replacements · {report.staleInputs.length} changed inputs
                    </p>
                    <ul className="admin-import-list">
                      {report.titles.map((t) => (
                        <li key={t.id}>
                          {t.title}{" "}
                          <small>
                            #{t.id} · {t.traits} traits · {t.status}
                          </small>
                        </li>
                      ))}
                    </ul>
                    {report.count > report.titles.length && (
                      <p>
                        Showing the first {report.titles.length} of{" "}
                        {report.count} validated titles.
                      </p>
                    )}
                    {importProgress && (
                      <p role="status">
                        {importProgress.completed} of{" "}
                        {importProgress.chunks.length} chunks saved. Successful
                        chunks will not be repeated.
                      </p>
                    )}
                    <button
                      className="soft-button"
                      disabled={busy || report.staleInputs.length > 0}
                      onClick={() =>
                        work(async () => {
                          let progress = { ...bundle };
                          for (
                            let index = progress.completed;
                            index < progress.chunks.length;
                            index++
                          ) {
                            const chunk = progress.chunks[index];
                            const preview = await api("/api/admin/validate", {
                              bundle: chunk,
                            });
                            // Retry the same key after a lost response; the server returns
                            // its saved receipt without writing or adding another revision.
                            const result = await api("/api/admin/import", {
                              bundle: chunk,
                              digest: preview.digest,
                              revision:
                                index === progress.completed
                                  ? progress.revision
                                  : preview.revision,
                              importKey: `${progress.key}:${index}`,
                            });
                            progress = {
                              ...progress,
                              completed: index + 1,
                              revision: result.revision,
                            };
                            setBundle(progress);
                            setImportProgress(progress);
                            setNotice(
                              `Imported ${progress.completed} of ${progress.chunks.length} chunks.`,
                            );
                          }
                          setBundle(null);
                          setReport(null);
                          await reload();
                          setNotice(
                            `Imported ${report.count} profiles across ${progress.chunks.length} chunks. Each chunk has its own import history and undo.`,
                          );
                        })
                      }
                    >
                      {importProgress
                        ? "Resume import"
                        : `Import ${report.count} profiles`}
                    </button>
                  </>
                )}
              </section>
            </div>
            <section className="admin-panel">
              <h2>Research library</h2>
              <label>
                Profile source
                <select
                  value={profileSource}
                  disabled={busy}
                  onChange={(e) => {
                    const source = e.target.value;
                    void work(async () => {
                      const page = await api(
                        `/api/admin/export?kind=${source}&limit=100`,
                      );
                      setProfileSource(source);
                      setProfiles(page.profiles);
                      setProfileCursor(page.nextCursor);
                    });
                  }}
                >
                  <option value="profiles">
                    Owner research & starter profiles
                  </option>
                  <option value="automatic">Automatic model profiles</option>
                </select>
              </label>
              <label>
                Search loaded profiles
                <input
                  type="search"
                  placeholder="Anime title or MAL ID"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <div className="admin-profiles">
                {profiles
                  .filter((p) =>
                    `${p.title} ${p.malId}`
                      .toLowerCase()
                      .includes(filter.toLowerCase()),
                  )
                  .map((p) => (
                    <details key={p.malId}>
                      <summary>
                        <strong>{p.title}</strong>
                        <span>
                          #{p.malId} · {p.status} ·{" "}
                          {
                            p.observations.filter((o) => o.score !== null)
                              .length
                          }{" "}
                          assessed traits
                        </span>
                      </summary>
                      <div className="admin-profile-body">
                        <p>
                          {when(p.analyzedAt)} · Private research hidden by
                          default.
                        </p>
                        <button
                          className="soft-button"
                          onClick={() =>
                            setRevealedProfiles((current) => {
                              const next = new Set(current);
                              const key = `${profileSource}:${p.malId}`;
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        >
                          {revealedProfiles.has(`${profileSource}:${p.malId}`)
                            ? "Hide private research"
                            : "Reveal private research — may contain spoilers"}
                        </button>
                        {revealedProfiles.has(
                          `${profileSource}:${p.malId}`,
                        ) && (
                          <p>
                            {p.scope} · {p.analyzer}
                          </p>
                        )}
                        <div className="admin-table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Trait</th>
                                <th>Presence / confidence</th>
                                <th>Role</th>
                                <th>Evidence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.observations.map((o) => (
                                <tr key={o.key}>
                                  <td>
                                    {status.vocabulary.find(
                                      (n) => n.key === o.key,
                                    )?.explanationSafe === false &&
                                    !revealedProfiles.has(
                                      `${profileSource}:${p.malId}`,
                                    )
                                      ? "Private outcome trait"
                                      : status.vocabulary.find(
                                          (n) => n.key === o.key,
                                        )?.label || o.key}
                                  </td>
                                  <td>
                                    {o.score === null
                                      ? "Unknown"
                                      : `${Math.round(o.score * 100)} / ${Math.round(o.confidence * 100)}`}
                                  </td>
                                  <td>{o.prominence}</td>
                                  <td>
                                    {revealedProfiles.has(
                                      `${profileSource}:${p.malId}`,
                                    )
                                      ? o.evidence
                                      : "Private evidence hidden"}
                                    <small>
                                      {revealedProfiles.has(
                                        `${profileSource}:${p.malId}`,
                                      )
                                        ? o.sources.join(", ")
                                        : "Sources hidden"}{" "}
                                      · {o.basis}
                                    </small>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <h3>Research coverage</h3>
                        {(p.coverage || []).length ? (
                          <dl className="admin-diagnostics">
                            {p.coverage.map((c) => (
                              <div key={c.area}>
                                <dt>
                                  {c.area} · {c.state}
                                </dt>
                                <dd>
                                  {revealedProfiles.has(
                                    `${profileSource}:${p.malId}`,
                                  )
                                    ? c.notes
                                    : "Private coverage notes hidden"}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="muted">
                            This older profile has no structured coverage
                            report. Its traits and notes are useful evidence,
                            not proof of exhaustive analysis.
                          </p>
                        )}
                        <h3>Reusable research dimensions</h3>
                        {(p.dimensions || []).length &&
                        !revealedProfiles.has(`${profileSource}:${p.malId}`) ? (
                          <p>
                            {p.dimensions.length} reusable dimensions. Reveal
                            private research to read them.
                          </p>
                        ) : (p.dimensions || []).length ? (
                          <div className="admin-table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>Area / dimension</th>
                                  <th>Supported context</th>
                                  <th>Confidence / sources</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.dimensions.map((d) => (
                                  <tr key={d.key}>
                                    <td>
                                      {d.area} · {d.key}
                                    </td>
                                    <td>{d.description}</td>
                                    <td>
                                      {Math.round(d.confidence * 100)} ·{" "}
                                      {d.basis}
                                      <small>{d.sources.join(", ")}</small>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="muted">
                            No reusable dimensions recorded yet. New taste
                            categories may need further research.
                          </p>
                        )}
                        {revealedProfiles.has(`${profileSource}:${p.malId}`) &&
                          [
                            ["Conditional appeal", p.appeal],
                            ["Caveats", p.caveats],
                            ["Not established", p.unknowns],
                          ].map(([name, notes]) =>
                            notes.length ? (
                              <div key={name}>
                                <h3>{name}</h3>
                                <ul>
                                  {notes.map((n, i) => (
                                    <li key={i}>{n}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null,
                          )}
                        {revealedProfiles.has(
                          `${profileSource}:${p.malId}`,
                        ) && (
                          <>
                            <h3>Sources</h3>
                            <ul>
                              {p.sources.map((s) => (
                                <li key={s.id}>
                                  <a
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {s.title}
                                  </a>{" "}
                                  <small>
                                    {s.id} · {s.type} · accessed{" "}
                                    {when(s.accessedAt)}
                                  </small>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        <small>
                          These notes are for research review. User explanations
                          use only the controlled trait vocabulary.
                        </small>
                      </div>
                    </details>
                  ))}
              </div>
              {profileCursor !== null && (
                <button
                  className="soft-button"
                  disabled={busy}
                  onClick={() =>
                    work(async () => {
                      const next = await api(
                        `/api/admin/export?kind=${profileSource}&limit=100&after=${profileCursor}`,
                      );
                      setProfiles((p) => [...p, ...next.profiles]);
                      setProfileCursor(next.nextCursor);
                    })
                  }
                >
                  Load more profiles
                </button>
              )}
            </section>
            <div className="admin-columns">
              <section className="admin-panel">
                <h2>Background services</h2>
                <dl className="admin-diagnostics">
                  {[
                    ["Review provider", status.enrichment.reviews.provider],
                    ["Queued review jobs", status.enrichment.reviews.queued],
                    [
                      "Profiles with review traits",
                      status.enrichment.reviews.profilesWithTraits,
                    ],
                    [
                      "Worker model enabled",
                      (status.enrichment.model?.enabled ??
                      status.enrichment.reviews.modelEnabled)
                        ? "Yes"
                        : "No",
                    ],
                    [
                      "Model attempts today",
                      status.enrichment.model?.attemptsToday ??
                        status.enrichment.reviews.modelRequestsToday ??
                        0,
                    ],
                    [
                      "Model daily app limit",
                      status.enrichment.model
                        ? status.enrichment.model.dailyLimit ||
                          "Until Cloudflare allowance is exhausted"
                        : status.enrichment.reviews.modelDailyLimit,
                    ],
                    ["Queued model jobs", status.enrichment.model?.queued ?? 0],
                    [
                      "Saved model profiles",
                      status.enrichment.model?.profiles ?? 0,
                    ],
                    [
                      "Model status",
                      status.enrichment.model?.status || "Disabled",
                    ],
                    ["Pause reason", status.enrichment.model?.reason || "None"],
                    [
                      "Model resumes",
                      status.enrichment.model?.pauseUntil > Date.now()
                        ? when(status.enrichment.model.pauseUntil)
                        : "Ready",
                    ],
                    [
                      "Reported input / output tokens today",
                      `${status.enrichment.model?.inputTokensToday || 0} / ${status.enrichment.model?.outputTokensToday || 0}`,
                    ],
                    [
                      "Last review failure",
                      status.enrichment.reviews.lastFailureCode || "None",
                    ],
                    [
                      "Last successful review fetch",
                      status.enrichment.reviews.lastSuccessAt
                        ? when(status.enrichment.reviews.lastSuccessAt)
                        : "None yet",
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{String(v ?? "Unavailable")}</dd>
                    </div>
                  ))}
                </dl>
                <p className="muted">
                  Research imported here makes no LLM calls. These counters are
                  app diagnostics, not Cloudflare billing or remaining neuron
                  allowance.
                </p>
              </section>
              <section className="admin-panel">
                <h2>Import history</h2>
                <ul>
                  {status.history.map((h) => (
                    <li key={h.revision}>
                      Revision {h.revision} · {h.kind} · {h.count} titles{" "}
                      <small>{when(h.at)}</small>
                    </li>
                  ))}
                </ul>
                {!status.history.length && (
                  <p>
                    No manual imports yet. Bundled starter profiles are
                    installed once.
                  </p>
                )}
                <button
                  className="soft-button admin-danger"
                  disabled={busy || status.history[0]?.kind !== "import"}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Undo the most recent import and restore its previous profiles?",
                      )
                    )
                      void work(async () => {
                        await api("/api/admin/rollback", {
                          revision: status.revision,
                        });
                        await reload();
                        setReport(null);
                        setNotice("Previous profiles restored.");
                      });
                  }}
                >
                  Undo latest import
                </button>
              </section>
            </div>
            <section className="admin-panel">
              <details>
                <summary>
                  <strong>Analysis framework and quality rules</strong>
                </summary>
                <ol>
                  {status.instructions.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ol>
                <p>
                  Presence and confidence are editorial estimates, not
                  calibrated probabilities. Independent sources can disagree.
                  Unassessed attributes must remain unknown.
                </p>
                <div className="admin-trait-list">
                  {status.vocabulary.map((n) => (
                    <span key={n.key}>{n.label}</span>
                  ))}
                </div>
              </details>
            </section>
          </div>
        </>
      )}
      {busy && (
        <div role="status" className="admin-working">
          Working…
        </div>
      )}
    </main>
  );
}
