import { useSyncExternalStore } from "react";
// Playback failures belong to this browser session, never the shared server cache:
// a trailer that fails in one country may still be available in another.
let blocked = new Set();
const listeners = new Set();
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => blocked;
export const useBlockedTrailers = () =>
  useSyncExternalStore(subscribe, snapshot, snapshot);
export function blockTrailer(id) {
  if (blocked.has(id)) return;
  blocked = new Set([...blocked, id]);
  for (const listener of listeners) listener();
}
