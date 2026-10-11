import { useState } from "react";
import { ReactionFeedback } from "./ReactionFeedback.jsx";
import { englishTitle, primaryTitle } from "../lib/titles.js";
export function ReactionHistory({ reactions, onSave }) {
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(12),
    [editing, setEditing] = useState(null),
    [editVersion, setEditVersion] = useState(0);
  if (!onSave) return null;
  const rows = Object.values(reactions)
    .filter((r) =>
      (primaryTitle(r.anime) + " " + englishTitle(r.anime))
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.at - a.at);
  return (
    <details className="reaction-history">
      <summary>Your reactions &amp; reasons</summary>
      <p>Revisit a choice and add or change optional reasons.</p>
      <label>
        Find an anime
        <input
          type="search"
          placeholder="Search your reactions"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(12);
          }}
        />
      </label>
      {editing && reactions[editing] && (
        <ReactionFeedback
          key={`${editing}:${reactions[editing].at}:${editVersion}`}
          reaction={reactions[editing]}
          onSave={onSave}
          onDismiss={() => setEditing(null)}
          startOpen
          inline
        />
      )}
      <ul>
        {rows.slice(0, limit).map((r) => (
          <li key={r.anime.id}>
            <span>
              {englishTitle(r.anime) || primaryTitle(r.anime)}
              <small>
                {
                  {
                    good: "Good",
                    bad: "Bad",
                    watch: "Would watch",
                    nope: "Won’t watch",
                  }[r.action]
                }
                {r.feedback?.aspects?.length
                  ? ` · ${r.feedback.aspects.length} reasons`
                  : ""}
              </small>
            </span>
            <button
              onClick={() => {
                setEditing(r.anime.id);
                setEditVersion((v) => v + 1);
              }}
            >
              Edit reasons
            </button>
          </li>
        ))}
      </ul>
      {!rows.length && <p>No reactions found.</p>}
      {rows.length > limit && (
        <button onClick={() => setLimit(limit + 12)}>Show more</button>
      )}
    </details>
  );
}
