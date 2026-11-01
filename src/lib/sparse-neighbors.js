/** Exact sparse cosine matches, preserving candidate feature and training order. */
export function createNeighborLookup(vectors) {
  const index = new Map();
  vectors.forEach((record, position) => {
    if (record.vector.size < 2) return;
    for (const [key, value] of record.vector) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ position, value });
    }
  });
  return (vector, norm, animeId) => {
    const sums = new Float64Array(vectors.length),
      shared = new Array(vectors.length);
    for (const [key, value] of vector)
      for (const entry of index.get(key) || []) {
        sums[entry.position] += value * entry.value;
        (shared[entry.position] ||= []).push(key);
      }
    const matches = [];
    vectors.forEach((record, position) => {
      if (record.anime.id === animeId || (shared[position]?.length || 0) < 2)
        return;
      const sim = sums[position] / (norm * record.norm || 1);
      if (sim >= 0.35)
        matches.push({ ...record, shared: shared[position], sim });
    });
    return matches;
  };
}
