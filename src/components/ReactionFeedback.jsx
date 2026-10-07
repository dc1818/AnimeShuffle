import { useEffect, useState } from "react";
import { REACTION_REASONS } from "../lib/reaction-reasons.js";
import { englishTitle, primaryTitle } from "../lib/titles.js";

/** Lightweight attribution after a vote. Never blocks the next card, and never
 * asks people to rate animation they have not seen or imply they watched a save. */
export function ReactionFeedback({ reaction, onReason, onDismiss, onOpen }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [reaction?.anime?.id]);
  if (!reaction || reaction.reason) return null;
  const heading = {
    good: "What worked for you?",
    bad: "What put you off?",
    watch: "What caught your interest?",
    nope: "What put you off?",
  }[reaction.action];
  return (
    <div className="vote-attribution">
      {!open ? (
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setOpen(true);
            onOpen?.();
          }}
        >
          Add a reason
        </button>
      ) : (
        <>
          <div className="vote-attribution-heading">
            <strong>{heading}</strong>
            <button
              type="button"
              className="quiet"
              aria-label="Close reaction feedback"
              onClick={onDismiss}
            >
              ×
            </button>
          </div>
          <span>
            {englishTitle(reaction.anime) || primaryTitle(reaction.anime)}
          </span>
          <div className="reaction-reason-options">
            {REACTION_REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onReason(reaction.anime.id, r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
