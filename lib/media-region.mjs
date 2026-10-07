/** Country comes from Cloudflare's connection metadata, never browser language. */
export const countryCode = (value) =>
  typeof value === "string" &&
  /^[A-Z]{2}$/.test(value) &&
  !["XX", "T1"].includes(value)
    ? value
    : null;
export function regionAllows(restriction, country) {
  // Explicit null means the provider reports no country restrictions. Missing
  // metadata is unknown; don't advertise that video as playable.
  if (restriction === null) return true;
  if (
    !restriction ||
    typeof restriction !== "object" ||
    Array.isArray(restriction)
  )
    return false;
  const hasAllowed = Object.hasOwn(restriction, "allowed"),
    hasBlocked = Object.hasOwn(restriction, "blocked");
  if (!hasAllowed && !hasBlocked) return false;
  for (const key of ["allowed", "blocked"]) {
    if (
      Object.hasOwn(restriction, key) &&
      (!Array.isArray(restriction[key]) ||
        restriction[key].some((c) => !countryCode(c)))
    )
      return false;
  }
  const c = countryCode(country);
  if (hasAllowed && (!c || !restriction.allowed.includes(c))) return false;
  if (
    hasBlocked &&
    (restriction.blocked.includes(c) || (!c && restriction.blocked.length))
  )
    return false;
  return true;
}
export function filterRegionalTrailers(data, country) {
  const trailers = data.trailers
    .filter((t) => regionAllows(t.regionRestriction, country))
    .map(({ regionRestriction, ...t }) => t);
  return { videoId: trailers[0]?.videoId || null, trailers };
}
