import { useEffect, useRef, useState, useId } from "react";
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

/** The compact prompt never blocks discovery. Only an explicit click opens the
 * small-screen modal; the desktop panel leaves the feed usable. */
export function ReactionFeedback({
  reaction,
  onSave,
  onDismiss,
  onOpenChange,
  inline = false,
  startOpen = false,
}) {
  const [open, setOpen] = useState(startOpen);
  const [group, setGroup] = useState(null);
  const [pending, setPending] = useState(null);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState(() =>
    normalizeFeedback(reaction?.feedback, reaction?.action),
  );
  const [status, setStatus] = useState("");
  const panel = useRef(null),
    trigger = useRef(null),
    note = useRef(null),
    draft = useRef(feedback),
    sequence = useRef(0);
  const id = useId();
  const seen = isSeenReaction(reaction?.action);
  const title =
    reaction && (englishTitle(reaction.anime) || primaryTitle(reaction.anime));
  const actionLabel = {
    good: "Good",
    bad: "Bad",
    watch: "Would watch",
    nope: "Won’t watch",
  }[reaction?.action];
  useEffect(() => {
    if (!open) return;
    const dialog = panel.current;
    const media = window.matchMedia("(max-width: 700px)");
    const display = () => {
      if (dialog.open) dialog.close();
      if (media.matches) dialog.showModal();
      else dialog.show();
    };
    display();
    media.addEventListener("change", display);
    return () => {
      media.removeEventListener("change", display);
      dialog.close();
    };
  }, [open]);
  useEffect(() => {
    if (!open) {
      const fresh = normalizeFeedback(reaction?.feedback, reaction?.action);
      draft.current = fresh;
      setFeedback(fresh);
    }
  }, [reaction?.feedback, reaction?.action, open]);
  if (!reaction) return null;
  async function save(next) {
    draft.current = next;
    setFeedback(next);
    const version = ++sequence.current;
    setStatus("Saving…");
    try {
      await onSave(reaction.anime.id, next);
      if (version === sequence.current) setStatus("Saved on this device");
    } catch (error) {
      if (version === sequence.current)
        setStatus(error.message || "Could not save. Please retry.");
    }
  }
  function close() {
    if (draft.current.note !== feedback.note) void save(draft.current);
    setOpen(false);
    setPending(null);
    setQuery("");
    onOpenChange?.(false);
    trigger.current?.focus();
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
  const rows =
    pending && !selected.some((a) => a.key === pending)
      ? [...selected, { key: pending }]
      : selected;
  return (
    <aside
      className={`feedback-prompt ${inline ? "feedback-inline" : ""}`}
      aria-label={`Feedback for ${title}`}
    >
      <div className="feedback-summary">
        <strong>{title}</strong>
        <span className={`feedback-badge ${reaction.action}`}>
          {actionLabel}
        </span>
      </div>
      <button
        ref={trigger}
        className="feedback-link"
        onClick={() => {
          setOpen(true);
          onOpenChange?.(true);
        }}
        aria-haspopup="dialog"
      >
        {selected.length || feedback.note
          ? "Edit your reasons"
          : "Add a reason (optional)"}
      </button>
      {onDismiss && (
        <button
          className="feedback-dismiss"
          aria-label="Dismiss optional feedback"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
      {open && (
        <dialog
          ref={panel}
          className="feedback-panel"
          aria-labelledby={`${id}-title`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <header className="feedback-header">
            <div>
              <span className="feedback-eyebrow">YOUR REACTION</span>
              <h2 id={`${id}-title`}>{title}</h2>
              <span className={`feedback-badge ${reaction.action}`}>
                {actionLabel}
              </span>
            </div>
            <button
              autoFocus
              className="feedback-close"
              aria-label="Close optional feedback"
              onClick={close}
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
              <div
                className="feedback-options"
                aria-label="Feedback categories"
              >
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
                  seen
                    ? "Search reasons, e.g. romance"
                    : "Search artwork, premise…"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {(options.length > 0 || query) && (
              <section
                className="feedback-detail"
                aria-label="Available reasons"
              >
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
                      aria-pressed={
                        pending === a.key ||
                        selected.some((s) => s.key === a.key)
                      }
                      onClick={() => choose(a.key)}
                    >
                      {a.label}
                      {selected.some((s) => s.key === a.key) ? " ✓" : ""}
                    </button>
                  ))}
                </div>
                {!options.length && (
                  <p className="feedback-hint">
                    No matching reason. You can leave a personal note below.
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
            <details className="feedback-note">
              <summary>
                {seen
                  ? "Add a personal note"
                  : "Something else / personal note"}
              </summary>
              <label htmlFor={`${id}-note`}>
                Saved with your profile; not used for matching.
              </label>
              <textarea
                id={`${id}-note`}
                ref={note}
                maxLength={500}
                defaultValue={feedback.note}
                placeholder="Anything you want to remember…"
                onChange={(e) => {
                  draft.current = { ...draft.current, note: e.target.value };
                }}
                onBlur={() => {
                  if (draft.current.note !== feedback.note)
                    void save(draft.current);
                }}
              />
              <small>Up to 500 characters.</small>
            </details>
          </div>
          <footer className="feedback-footer">
            <span role="status">
              {status ||
                (selected.length
                  ? `${selected.length} reasons saved`
                  : "You can skip this anytime.")}
            </span>
            {status.includes("retry") && (
              <button onClick={() => void save(draft.current)}>Retry</button>
            )}
            <button className="primary" onClick={close}>
              Done
            </button>
          </footer>
        </dialog>
      )}
    </aside>
  );
}
