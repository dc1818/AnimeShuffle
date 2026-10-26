/** Bounded, positive-only interest signals; never ratings or watchlist edits. */
export function normalizeComparisons(input) {
  if (!Array.isArray(input)) return [];
  return [...new Map(input.filter(x => Number.isInteger(x?.anime?.id) && x.anime.id > 0 && typeof x.anime.title === 'string').map(x => [x.anime.id, {
    anime: { id: x.anime.id, title: x.anime.title.slice(0, 200), genres: Array.isArray(x.anime.genres) ? x.anime.genres.filter(g => typeof g === 'string').slice(0,20).map(g => g.slice(0,60)) : [], format: String(x.anime.format || 'unknown').slice(0,30) },
    kind: ['priority','companion','lineup','head'].includes(x.kind) ? x.kind : 'head',
  }])).values()].slice(-100);
}
export function comparisonChoices(anime, saved, variant) {
  const others = [...new Map(saved.filter(a => a.id !== anime.id).map(a => [a.id,a])).values()];
  if (!others.length) return null;
  const [a,b] = others;
  const kind = b ? variant % 4 : 0;
  return {kind, a, b};
}
