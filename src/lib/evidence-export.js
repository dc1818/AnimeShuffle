import { NUANCES } from './nuanced-taste.js';
import { RESEARCH_TRAITS } from './research-taxonomy.js';

export const evidenceVocabulary = [
  ...NUANCES.map(n => ({key:n.key,label:n.label,category:'Detailed tastes',evidenceOnly:n.reviewOnly})),
  ...RESEARCH_TRAITS,
];

/** Public metadata only. Never export account history, tokens or inferred traits as evidence. */
export function evidenceProfile(a) {
  if (!Number.isSafeInteger(a?.id) || a.id < 1 || typeof a.title !== 'string' || !a.title.trim())
    throw Error('Every exported anime needs a MAL ID and title.');
  const aliases=[...new Set([a.englishTitle,a.japaneseTitle,...(a.synonyms || [])]
    .filter(v => typeof v === 'string' && v.trim() && v !== a.title))];
  const format=String(a.format || 'UNKNOWN').toUpperCase();
  const year=Number.isSafeInteger(a.year) && a.year > 0 ? a.year : null;
  return {malId:a.id,title:a.title,aliases,identityAliases:aliases,year,format,
    episodes:Number.isSafeInteger(a.episodes) && a.episodes > 0 ? a.episodes : null,
    status:a.status || '',synopsis:a.synopsis || '',genres:a.genres || [],studios:a.studios || [],
    durationMinutes:a.duration ?? null,metadataFingerprint:a.metadataFingerprint ?? null,
    metadataSource:'MyAnimeList metadata stored by Anime Shuffle',
    malUrl:`https://myanimelist.net/anime/${a.id}`,
    scope:`Exact MAL ${a.id}: ${a.title}. Exclude other adaptations, seasons, sequels and franchise entries.`,
    metadataGaps:[...(!year ? ['year'] : []),...(['UNKNOWN',''].includes(format) ? ['format'] : [])]};
}

export function makeEvidenceExport(anime,source='recommendation-candidates',vocabulary=evidenceVocabulary) {
  const seen=new Set(),profiles=[];
  for (const item of anime) {
    const profile=evidenceProfile(item);
    if (!seen.has(profile.malId)) {seen.add(profile.malId);profiles.push(profile);}
  }
  return {format:'anime-shuffle-evidence-input',schemaVersion:1,exportedAt:new Date().toISOString(),
    source,selectionOrder:'Preserve this order; displayed recommendations precede other candidates when exported from Recommendations.',
    count:profiles.length,profiles,vocabulary};
}

export async function collectEvidenceExport(fetchPage,onProgress=()=>{}) {
  const rows=[];let after=0,vocabulary;
  for (;;) {
    const page=await fetchPage(after);
    if (!Array.isArray(page.catalog) || !Array.isArray(page.vocabulary)) throw Error('Invalid catalog export page.');
    if (vocabulary && JSON.stringify(vocabulary)!==JSON.stringify(page.vocabulary))
      throw Error('Trait definitions changed during export. Please export again.');
    vocabulary=page.vocabulary;rows.push(...page.catalog);onProgress(rows.length);
    if (page.nextCursor==null) break;
    if (!Number.isSafeInteger(page.nextCursor) || page.nextCursor<=after) throw Error('Export pagination did not advance.');
    after=page.nextCursor;
  }
  return makeEvidenceExport(rows,'known-site-catalog',vocabulary);
}

export function downloadEvidenceExport(data) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`anime-shuffle-evidence-${data.count}.json`;
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
