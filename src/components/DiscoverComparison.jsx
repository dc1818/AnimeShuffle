import { useState } from 'react';
import { primaryTitle } from '../lib/titles.js';
import { comparisonChoices } from '../lib/discover-comparison.js';

export function DiscoverComparison({anime, saved = [], onSave, onPreferences}) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random()*10000));
  const [pool] = useState(() => saved.map(a => ({a, n: Math.random()})).sort((a,b) => a.n-b.n).map(x => x.a));
  const [status,setStatus] = useState('');
  const [busy,setBusy] = useState(false);
  const rotated = pool.length ? [...pool.slice(seed % pool.length), ...pool.slice(0,seed % pool.length)] : [];
  const choice = comparisonChoices(anime, rotated, seed);
  async function choose(selected, kind) {
    setBusy(true);
    try { if (selected.length) await onSave?.(selected.map(anime => ({anime,kind}))); setStatus(selected.length ? 'Preference saved' : 'No preference recorded'); }
    catch { setStatus('Could not save. Please try again.'); }
    finally { setBusy(false); }
  }
  function tile(a, label, selected, kind) {
    return <button type="button" className="comparison-choice" title={primaryTitle(a)} disabled={busy} onClick={() => choose(selected,kind)}>
      {a.image && <img src={'/api/image?url='+encodeURIComponent(a.image)} alt="" loading="lazy" width="40" height="56"/>}
      <span><small>{label}</small><strong>{primaryTitle(a)}</strong></span>
    </button>;
  }
  if (!choice) return <section className="discover-comparison"><strong>Build your next-watch shortlist</strong><p>Save an anime with Would watch to unlock quick comparisons here.</p><button type="button" onClick={onPreferences}>Explore your viewing preferences</button></section>;
  const {kind,a,b} = choice;
  const headings = ['Which would you start first?', 'Where would you place this one?', 'What would you pair this with?', 'Which lineup would you choose?'];
  return <section className="discover-comparison" aria-label="Optional watchlist comparison">
    <header><strong>{headings[kind]}</strong><span>Optional</span></header>
    <div className={'comparison-options variant-'+kind}>
      {kind === 0 && <>{tile(anime,'This pick',[anime],'head')}{tile(a,'Your watchlist',[a],'head')}</>}
      {kind === 1 && <><p className="comparison-queue" title={primaryTitle(a)+' → '+primaryTitle(b)}>{primaryTitle(a)} <span>→</span> {primaryTitle(b)}</p><div className="comparison-priority">{[['Before both',[anime]],['Between them',[a,anime]],['After both',[a,b]]].map(([label,selected]) => <button key={label} disabled={busy} onClick={() => choose(selected,'priority')}>{label}</button>)}</div></>}
      {kind === 2 && <>{tile(a,'Pair with this pick',[a],'companion')}{tile(b,'Pair with this pick',[b],'companion')}</>}
      {kind === 3 && <>{tile(a,'This pick +',[a],'lineup')}{tile(b,'This pick +',[b],'lineup')}</>}
    </div>
    <footer><button disabled={busy} onClick={() => choose([],'head')}>No preference</button><span role="status">{busy ? 'Saving…' : status}</span><button disabled={busy} onClick={() => {setSeed(n=>n+1);setStatus('');}}>Another question</button></footer>
  </section>;
}
