/** No total profile limit: bound individual requests to protect the Worker. */
export function splitResearchUpload(
  bundle,
  { chunkSize = 1000, maxBytes = 15_000_000 } = {},
) {
  if (
    !Number.isSafeInteger(chunkSize) ||
    chunkSize < 1 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 100
  )
    throw Error("Invalid research upload chunk settings.");
  if (
    bundle?.format !== "anime-shuffle-research" ||
    bundle.schemaVersion !== 1 ||
    !Array.isArray(bundle.profiles) ||
    !bundle.profiles.length
  )
    throw Error("Choose an Anime Shuffle research JSON with profiles.");
  const seen = new Set(),
    chunks = [];
  let profiles = [],
    bytes = 100;
  for (const profile of bundle.profiles) {
    if (
      !Number.isSafeInteger(profile?.malId) ||
      profile.malId < 1 ||
      seen.has(profile.malId)
    )
      throw Error(
        "Anime IDs must be unique positive MAL IDs across the entire file.",
      );
    seen.add(profile.malId);
    const size = new TextEncoder().encode(JSON.stringify(profile)).length + 1;
    if (size + 100 > maxBytes)
      throw Error(`Profile ${profile.malId} is too large for one request.`);
    if (
      profiles.length &&
      (profiles.length >= chunkSize || bytes + size > maxBytes)
    ) {
      chunks.push({
        format: bundle.format,
        schemaVersion: bundle.schemaVersion,
        profiles,
      });
      profiles = [];
      bytes = 100;
    }
    profiles.push(profile);
    bytes += size;
  }
  if (profiles.length)
    chunks.push({
      format: bundle.format,
      schemaVersion: bundle.schemaVersion,
      profiles,
    });
  return chunks;
}

export async function previewResearchUpload(
  chunks,
  api,
  onProgress = () => {},
) {
  const report = {
    count: 0,
    newProfiles: 0,
    replacements: 0,
    mergeChanges: {},
    staleInputs: [],
    titles: [],
    revision: null,
  };
  for (let index = 0; index < chunks.length; index++) {
    const current = await api("/api/admin/validate", { bundle: chunks[index] });
    if (report.revision !== null && report.revision !== current.revision)
      throw Error("Research changed during validation. Choose the file again.");
    report.revision = current.revision;
    for (const key of ["count", "newProfiles", "replacements"])
      report[key] += current[key];
    for (const [key, value] of Object.entries(current.mergeChanges || {}))
      report.mergeChanges[key] = (report.mergeChanges[key] || 0) + value;
    report.staleInputs.push(...current.staleInputs);
    report.titles.push(
      ...current.titles.slice(0, Math.max(0, 50 - report.titles.length)),
    );
    onProgress(index + 1, chunks.length);
  }
  return report;
}
