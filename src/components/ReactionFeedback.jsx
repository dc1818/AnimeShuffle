import { useEffect, useRef, useState } from "react";
import { englishTitle, primaryTitle } from "../lib/titles.js";
import {
  FEEDBACK_GROUPS,
  FEEDBACK_ASPECTS,
  FEEDBACK_BY_KEY,
  INTEREST_ASPECTS,
  FEEDBACK_LIMIT,
  isSeenReaction,
  normalizeFeedback,
} from "../lib/reaction-feedback.js";

export const reactionLabel = (action) =>
  ({ good: "Good", bad: "Bad", watch: "Would watch", nope: "Won’t watch" })[
    action
  ];

// Embedded in AnimeDetails: the existing responsive panel owns its modality.
export function ReactionFeedback({
  reaction,
  onSave,
  onDone,
  onClose,
  headingId,
}) {
  const [group, setGroup] = useState(null);
  const [pending, setPending] = useState(null);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState(() =>
    normalizeFeedback(reaction.feedback, reaction.action),
  );
  const [status, setStatus] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const draft = useRef(feedback),
    sequence = useRef(0),
    back = useRef(null);
  useEffect(() => {
    back.current?.focus();
  }, []);
  const seen = isSeenReaction(reaction.action);
  const title = englishTitle(reaction.anime) || primaryTitle(reaction.anime);
  const actionLabel = reactionLabel(reaction.action);
  async function save(next) {
    draft.current = next;
    setFeedback(next);
    const version = ++sequence.current;
    setStatus("Saving…");
    setSaveFailed(false);
    try {
      await onSave(reaction.anime.id, next);
      if (version === sequence.current) setStatus("Saved on this device");
    } catch (error) {
      if (version === sequence.current) {
        setSaveFailed(true);
        setStatus(error.message || "Could not save. Please retry.");
      }
    }
  }
  const selected = feedback.aspects;
  const allowed = seen
    ? FEEDBACK_ASPECTS.filter((a) =>
        FEEDBACK_GROUPS.some((g) => g.items.includes(a.key)),
      )
    : INTEREST_ASPECTS.map((k) => FEEDBACK_BY_KEY.get(k));
  const options = query.trim()
    ? allowed
        .filter((a) =>
          (a.label + " " + a.key)
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .slice(0, 8)
    : seen
      ? (FEEDBACK_GROUPS.find((g) => g.key === group)?.items || []).map((k) =>
          FEEDBACK_BY_KEY.get(k),
        )
      : allowed;
  function choose(key) {
    if (
      !selected.some((a) => a.key === key) &&
      selected.length >= FEEDBACK_LIMIT
    ) {
      setStatus(
        `Choose up to ${FEEDBACK_LIMIT} reasons. Remove one to add another.`,
      );
      return;
    }
    setPending(key);
  }
  function opinion(key, sentiment) {
    const aspects = [
      ...draft.current.aspects.filter((a) => a.key !== key),
      { key, sentiment },
    ];
    setPending(null);
    void save({ ...draft.current, aspects });
  }
  // Opening the add flow never chooses a reason or opinion. Existing votes live
  // in a separate saved list and are edited only after an explicit click.
  const rows = pending
    ? [selected.find((a) => a.key === pending) || { key: pending }]
    : [];
  return (
    <section
      className="feedback-editor"
      aria-label={`Reasons for your saved reaction to ${title}`}
    >
      <header className="feedback-header">
        <div>
          <button ref={back} className="feedback-back" onClick={onDone}>
            ‹ Back to Why this pick?
          </button>
          <span className="feedback-eyebrow">YOUR SAVED REACTION</span>
          <h2 id={headingId}>{title}</h2>
          <span className={`feedback-badge ${reaction.action}`}>
            {actionLabel}
          </span>
          <p className="feedback-hint">
            You marked this anime as {actionLabel}.
          </p>
        </div>
        <button
          className="feedback-close"
          aria-label="Close anime details"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="feedback-body">
        <h3>
          {seen
            ? "What shaped your opinion?"
            : reaction.action === "nope"
              ? "What put you off?"
              : "What caught your eye?"}
        </h3>
        <p className="feedback-hint">
          {seen
            ? "Optional · Choose only what mattered."
            : "Optional · You don’t need to have seen it."}
        </p>
        {seen && (
          <div className="feedback-options" aria-label="Feedback categories">
            {FEEDBACK_GROUPS.map((g) => (
              <button
                key={g.key}
                aria-pressed={group === g.key && !query}
                onClick={() => {
                  setGroup(group === g.key ? null : g.key);
                  setQuery("");
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
        <label className="feedback-search">
          Find another reason
          <input
            type="search"
            placeholder={
              seen ? "Search reasons, e.g. romance" : "Search artwork, premise…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {(options.length > 0 || query) && (
          <section className="feedback-detail" aria-label="Available reasons">
            <h4>
              {query
                ? "Matching reasons"
                : seen
                  ? FEEDBACK_GROUPS.find((g) => g.key === group)?.label
                  : "What influenced your choice?"}
            </h4>
            <div className="feedback-options">
              {options.map((a) => (
                <button
                  key={a.key}
                  aria-pressed={pending === a.key}
                  onClick={() => choose(a.key)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {!options.length && (
              <p className="feedback-hint">
                No matching reason. Try another search or choose a category.
              </p>
            )}
          </section>
        )}
        <div className="feedback-selected">
          {rows.map((a) => (
            <fieldset key={a.key} className="feedback-opinion">
              <legend>{FEEDBACK_BY_KEY.get(a.key)?.label}</legend>
              <div className="feedback-opinion-controls">
                <button
                  className="feedback-like"
                  aria-pressed={a.sentiment === "liked"}
                  onClick={() => opinion(a.key, "liked")}
                >
                  {a.sentiment === "liked" ? "✓ " : ""}
                  {seen ? "Liked" : "Appealed to me"}
                </button>
                <button
                  className="feedback-dislike"
                  aria-pressed={a.sentiment === "disliked"}
                  onClick={() => opinion(a.key, "disliked")}
                >
                  {a.sentiment === "disliked" ? "✓ " : ""}
                  {seen ? "Disliked" : "Put me off"}
                </button>
                <button
                  className="feedback-remove"
                  aria-label={`Remove ${FEEDBACK_BY_KEY.get(a.key)?.label}`}
                  onClick={() => {
                    setPending(null);
                    void save({
                      ...draft.current,
                      aspects: draft.current.aspects.filter(
                        (s) => s.key !== a.key,
                      ),
                    });
                  }}
                >
                  ×
                </button>
              </div>
              {!a.sentiment && (
                <small>Choose an opinion to save this reason.</small>
              )}
            </fieldset>
          ))}
        </div>
        {selected.length > 0 && (
          <section className="feedback-saved" aria-label="Saved reasons">
            <h4>Saved reasons</h4>
            <ul>
              {selected.map((a) => (
                <li key={a.key}>
                  <span>
                    {FEEDBACK_BY_KEY.get(a.key)?.label} ·{" "}
                    {a.sentiment === "liked"
                      ? seen
                        ? "Liked"
                        : "Appealed to me"
                      : seen
                        ? "Disliked"
                        : "Put me off"}
                  </span>
                  <button
                    className="quiet"
                    onClick={() => choose(a.key)}
                    aria-label={`Edit ${FEEDBACK_BY_KEY.get(a.key)?.label}`}
                  >
                    Edit
                  </button>
                  <button
                    className="quiet"
                    aria-label={`Delete saved ${FEEDBACK_BY_KEY.get(a.key)?.label}`}
                    onClick={() => {
                      if (pending === a.key) setPending(null);
                      void save({
                        ...draft.current,
                        aspects: draft.current.aspects.filter(
                          (s) => s.key !== a.key,
                        ),
                      });
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <footer className="feedback-footer">
        <span role="status">
          {status ||
            (selected.length
              ? `${selected.length} reasons saved`
              : "Optional · Saved automatically")}
        </span>
        {saveFailed && (
          <button onClick={() => void save(draft.current)}>Retry</button>
        )}
        <button className="primary" onClick={onDone}>
          Done
        </button>
      </footer>
    </section>
  );
}
