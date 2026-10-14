import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { englishTitle, primaryTitle } from "../lib/titles.js";
import {
  FEEDBACK_GROUPS,
  FEEDBACK_BY_KEY,
  INTEREST_ASPECTS,
  FEEDBACK_LIMIT,
  CUSTOM_REASON_LENGTH,
  isSeenReaction,
  normalizeFeedback,
} from "../lib/reaction-feedback.js";
export const reactionLabel = (action) =>
  ({ good: "Good", bad: "Bad", watch: "Would watch", nope: "Won’t watch" })[
    action
  ];

// Optional viewer opinions: categories only reveal choices; reasons require a click.
export function ReactionFeedback({
  reaction,
  onSave,
  onDone,
  onClose,
  headingId,
}) {
  const [groups, setGroups] = useState([]);
  const [custom, setCustom] = useState("");
  const [feedback, setFeedback] = useState(() =>
    normalizeFeedback(reaction.feedback, reaction.action),
  );
  const [chosen, setChosen] = useState([]);
  const [flashes, setFlashes] = useState({});
  const [status, setStatus] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const draft = useRef(feedback),
    sequence = useRef(0),
    back = useRef(null),
    timers = useRef(new Map()),
    saves = useRef(Promise.resolve());
  useEffect(() => {
    back.current?.focus();
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    };
  }, []);
  const seen = isSeenReaction(reaction.action);
  const title = englishTitle(reaction.anime) || primaryTitle(reaction.anime);
  const actionLabel = reactionLabel(reaction.action);
  async function save(input) {
    const next = normalizeFeedback(input, reaction.action);
    draft.current = next;
    setFeedback(next);
    const version = ++sequence.current;
    setStatus("Saving…");
    setSaveFailed(false);
    // Rapid selections retain their order and the latest complete set of reasons.
    const job = saves.current
      .catch(() => {})
      .then(() => onSave(reaction.anime.id, next));
    saves.current = job;
    try {
      await job;
      if (version === sequence.current) setStatus("Saved on this device");
    } catch (error) {
      if (version === sequence.current) {
        setSaveFailed(true);
        setStatus(error.message || "Could not save. Please retry.");
      }
    }
  }
  function room() {
    if (
      draft.current.aspects.length +
        (draft.current.customReasons?.length || 0) <
      FEEDBACK_LIMIT
    )
      return true;
    setStatus(
      `Choose up to ${FEEDBACK_LIMIT} reasons. Remove one to add another.`,
    );
    return false;
  }
  function like(key) {
    const existing = draft.current.aspects.find((a) => a.key === key);
    if (!existing && !room()) return;
    const removing = chosen.includes(key);
    setChosen((keys) => removing ? keys.filter((item) => item !== key) : [...new Set([...keys, key])]);
    setFlashes((all) => ({ ...all, [key]: removing ? "Unliked" : "Liked" }));
    clearTimeout(timers.current.get(key));
    timers.current.set(
      key,
      setTimeout(() => {
        setFlashes((all) => ({ ...all, [key]: false }));
        timers.current.delete(key);
      }, 1000),
    );
    void save({
      ...draft.current,
      aspects: [
        ...draft.current.aspects.filter((a) => a.key !== key),
        ...(removing ? [] : [{ key, sentiment: "liked" }]),
      ],
    });
  }
  function addCustom(event) {
    event.preventDefault();
    const text = custom.replace(/\s+/g, " ").trim();
    if (!text) return;
    if (
      (draft.current.customReasons || []).some(
        (r) => r.toLocaleLowerCase() === text.toLocaleLowerCase(),
      )
    ) {
      setStatus("That reason is already saved.");
      return;
    }
    if (!room()) return;
    void save({
      ...draft.current,
      customReasons: [...(draft.current.customReasons || []), text],
    });
    setCustom("");
  }
  const sections = seen
    ? FEEDBACK_GROUPS.filter((g) => groups.includes(g.key))
    : [
        {
          key: "interest",
          label: "What appealed to you?",
          items: INTEREST_ASPECTS,
        },
      ];
  const selected = feedback.aspects;
  const customReasons = feedback.customReasons || [];
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
        <h3>{seen ? "What shaped your opinion?" : "What caught your eye?"}</h3>
        <p className="feedback-hint">
          Optional · Tap a reason to mark it Liked.
          {["bad", "nope"].includes(reaction.action)
            ? " You can like individual parts even with a negative overall reaction."
            : " Choose only what mattered."}
        </p>
        {seen && (
          <div
            className="feedback-options feedback-categories"
            aria-label="Feedback categories"
          >
            {FEEDBACK_GROUPS.map((g) => (
              <button
                key={g.key}
                aria-pressed={groups.includes(g.key)}
                aria-expanded={groups.includes(g.key)}
                aria-controls={`feedback-group-${g.key}`}
                onClick={() =>
                  setGroups((open) =>
                    open.includes(g.key)
                      ? open.filter((key) => key !== g.key)
                      : [...open, g.key],
                  )
                }
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
        {sections.map((g) => (
          <section
            key={g.key}
            id={`feedback-group-${g.key}`}
            className="feedback-detail"
            aria-label={`${g.label} reasons`}
          >
            <h4>{g.label}</h4>
            <div className="feedback-options feedback-reasons">
              {g.items.map((key) => (
                <button
                  key={key}
                  className={flashes[key] ? "reason-flash" : ""}
                  aria-label={FEEDBACK_BY_KEY.get(key).label}
                  aria-pressed={chosen.includes(key)}
                  onClick={() => like(key)}
                >
                  <span className="reason-label">
                    {flashes[key] || FEEDBACK_BY_KEY.get(key).label}
                  </span>
                  <Icon name="thumbUp" />

                </button>
              ))}
            </div>
          </section>
        ))}
        <form className="feedback-custom" onSubmit={addCustom}>
          <label className="feedback-search">
            Type your own reason
            <input
              type="text"
              maxLength={CUSTOM_REASON_LENGTH}
              placeholder="What stood out to you?"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
            />
          </label>
          <div className="feedback-custom-actions">
            <small>
              {custom.length}/{CUSTOM_REASON_LENGTH}
            </small>
            <button
              className="feedback-add"
              disabled={!custom.trim()}
              type="submit"
            >
              Add reason
            </button>
          </div>
        </form>
        {(selected.length > 0 || customReasons.length > 0) && (
          <section className="feedback-saved" aria-label="Saved reasons">
            <h4>Saved reasons</h4>
            <ul>
              {selected.map((a) => (
                <li key={a.key}>
                  <span>
                    {FEEDBACK_BY_KEY.get(a.key)?.label} ·{" "}
                    {a.sentiment === "liked" ? "Liked" : "Disliked"}
                  </span>
                  <button
                    className="quiet"
                    aria-label={`Remove ${FEEDBACK_BY_KEY.get(a.key)?.label}`}
                    onClick={() => {
                      setChosen((keys) => keys.filter((key) => key !== a.key));
                      void save({
                        ...draft.current,
                        aspects: draft.current.aspects.filter(
                          (item) => item.key !== a.key,
                        ),
                      });
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {customReasons.map((text) => (
                <li key={text}>
                  <span>{text}</span>
                  <button
                    className="quiet"
                    aria-label={`Remove custom reason: ${text}`}
                    onClick={() =>
                      void save({
                        ...draft.current,
                        customReasons: draft.current.customReasons.filter(
                          (r) => r !== text,
                        ),
                      })
                    }
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
            (selected.length + customReasons.length
              ? `${selected.length + customReasons.length} reasons saved`
              : "Optional · Nothing selected")}
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
