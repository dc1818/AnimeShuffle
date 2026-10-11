/** Compact, bounded exposure/outcome history. Unseen titles and skips are never
 * negative labels. Guest history stays on this browser; account events sync. */
export const RECOMMENDER_VERSION = "hybrid-v1";
export function cleanRecommendationEvent(e, now = Date.now()) {
  if (
    !e ||
    !/^[\w-]{8,80}$/.test(e.eventId || "") ||
    !Number.isSafeInteger(e.animeId) ||
    e.animeId < 1 ||
    e.animeId > 10000000 ||
    !["impression", "good", "bad", "watch", "nope", "skip", "undo"].includes(
      e.kind,
    ) ||
    !["discover", "recommendations", "unknown"].includes(e.surface) ||
    !Number.isSafeInteger(e.at) ||
    e.at < now - 90 * 86400000 ||
    e.at > now + 300000
  )
    return null;
  return {
    eventId: e.eventId,
    animeId: e.animeId,
    kind: e.kind,
    surface: e.surface,
    at: e.at,
    position:
      Number.isInteger(e.position) && e.position >= 1 && e.position <= 100
        ? e.position
        : null,
    model:
      typeof e.model === "string" && /^[\w.-]{1,40}$/.test(e.model)
        ? e.model
        : "unknown",
    exposureId:
      typeof e.exposureId === "string" && /^[\w-]{8,80}$/.test(e.exposureId)
        ? e.exposureId
        : null,
  };
}
export function createRecommendationEvents({
  storage,
  key,
  api,
  canSync,
  now = Date.now,
}) {
  let events = [],
    pending = [],
    timer,
    running,
    disposed = false;
  try {
    const saved = JSON.parse(storage.getItem(key) || "{}");
    events = (saved.events || [])
      .map((e) => cleanRecommendationEvent(e, now()))
      .filter(Boolean)
      .slice(-1000);
    const ids = new Set(events.map((e) => e.eventId));
    pending = (saved.pending || []).filter((id) => ids.has(id));
  } catch {
    /* Optional diagnostics must never prevent discovery. */
  }
  function save() {
    try {
      storage.setItem(key, JSON.stringify({ events, pending }));
    } catch {}
  }
  function schedule() {
    if (disposed || timer || !canSync() || !pending.length) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, 1500);
    timer.unref?.();
  }
  async function flush() {
    if (disposed || !canSync()) return;
    if (running) return running;
    running = (async () => {
      const batch = events
        .filter((e) => pending.includes(e.eventId))
        .slice(0, 40);
      if (!batch.length) return;
      try {
        await api("/api/recommendation-events", { events: batch });
        const ids = new Set(batch.map((e) => e.eventId));
        pending = pending.filter((id) => !ids.has(id));
        save();
        schedule();
      } catch {
        /* Retain outbox for next exposure/reload, without blocking votes. */
      }
    })().finally(() => {
      running = null;
    });
    return running;
  }
  function record(animeId, kind, context = {}) {
    if (disposed) return;
    const at = now();
    events = events.filter((e) => cleanRecommendationEvent(e, at));
    const previous = [...events]
      .reverse()
      .find(
        (e) =>
          e.animeId === animeId &&
          e.kind === "impression" &&
          (!context.surface || e.surface === context.surface) &&
          at - e.at >= 0 &&
          at - e.at < 86400000,
      );
    const surface = context.surface || previous?.surface || "unknown";
    if (
      kind === "impression" &&
      previous?.surface === surface &&
      previous.position === context.position &&
      at - previous.at < 300000
    )
      return;
    const event = cleanRecommendationEvent(
      {
        eventId: globalThis.crypto.randomUUID(),
        animeId,
        kind,
        at,
        surface,
        position: context.position ?? previous?.position,
        model: RECOMMENDER_VERSION,
        exposureId: kind === "impression" ? null : previous?.eventId,
      },
      at,
    );
    if (!event) return;
    events = [...events, event].slice(-1000);
    if (canSync()) pending.push(event.eventId);
    const ids = new Set(events.map((e) => e.eventId));
    pending = pending.filter((id) => ids.has(id));
    save();
    schedule();
    return event;
  }
  schedule();
  return {
    record,
    flush,
    snapshot: () => events.map((e) => ({ ...e })),
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
