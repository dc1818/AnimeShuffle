export const SKIP_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Browser-local, per-profile scheduling only; a skip is never a taste vote. */
export function activeSkipCooldowns(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, until]) =>
        Number.isSafeInteger(Number(id)) &&
        Number(id) > 0 &&
        typeof until === "number" &&
        Number.isFinite(until) &&
        until > now &&
        until <= now + SKIP_COOLDOWN_MS,
    ),
  );
}
