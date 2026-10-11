import { cleanRecommendationEvent } from "../src/lib/recommendation-events.js";
import { AppError } from "./mal.mjs";
/** Account events are separate from preference state: retries cannot add votes. */
export function createRecommendationEventStore(storage) {
  const sql = storage.sql;
  sql.exec(
    "CREATE TABLE IF NOT EXISTS recommendation_events (account_id TEXT NOT NULL,event_id TEXT NOT NULL,at INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(account_id,event_id))",
  );
  sql.exec(
    "CREATE INDEX IF NOT EXISTS recommendation_events_at ON recommendation_events(at)",
  );
  function read(id) {
    return Array.from(
      sql.exec(
        "SELECT value FROM recommendation_events WHERE account_id=? AND at>=? ORDER BY at LIMIT 1000",
        id,
        Date.now() - 90 * 86400000,
      ),
    ).map((r) => JSON.parse(r.value));
  }
  return {
    read,
    write(id, body, now = Date.now()) {
      if (!Array.isArray(body.events) || body.events.length > 40)
        throw new AppError("Invalid event batch.");
      const events = body.events.map((e) => cleanRecommendationEvent(e, now));
      if (events.some((e) => !e))
        throw new AppError("Invalid recommendation event.");
      storage.transactionSync(() => {
        for (const e of events)
          sql.exec(
            "INSERT OR IGNORE INTO recommendation_events VALUES (?,?,?,?)",
            id,
            e.eventId,
            e.at,
            JSON.stringify(e),
          );
        sql.exec(
          "DELETE FROM recommendation_events WHERE at<?",
          now - 90 * 86400000,
        );
        sql.exec(
          "DELETE FROM recommendation_events WHERE account_id=? AND event_id IN (SELECT event_id FROM recommendation_events WHERE account_id=? ORDER BY at DESC,event_id LIMIT -1 OFFSET 1000)",
          id,
          id,
        );
        sql.exec(
          "DELETE FROM recommendation_events WHERE rowid IN (SELECT rowid FROM recommendation_events ORDER BY at DESC,rowid DESC LIMIT -1 OFFSET 50000)",
        );
      });
      return { accepted: events.length };
    },
    export() {
      const rows = Array.from(
        sql.exec(
          "SELECT r.account_id,r.value FROM reactions r LEFT JOIN account_controls c ON c.id=r.account_id WHERE COALESCE(c.disabled,0)=0 ORDER BY r.account_id,r.anime_id LIMIT 10000",
        ),
      );
      const groups = new Map();
      for (const row of rows) {
        if (!groups.has(row.account_id)) groups.set(row.account_id, []);
        try {
          const reaction = JSON.parse(row.value);
          if (reaction.feedback)
            reaction.feedback = { ...reaction.feedback, note: "" };
          groups.get(row.account_id).push(reaction);
        } catch {}
      }
      return {
        app: "anime-shuffle-evaluation",
        version: 1,
        exportedAt: Date.now(),
        note: "Bounded snapshot of current signed-in reactions and 90-day events. User keys are export-local; no names or credentials. Metadata is current, not a historical snapshot. Not an unbiased experiment.",
        users: [...groups].map(([id, reactions], i) => ({
          user: "u" + (i + 1),
          reactions,
          events: read(id),
        })),
      };
    },
  };
}
