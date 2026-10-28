import { useEffect, useState } from 'react';
import { primaryTitle } from '../lib/titles.js';
import { comparisonChoices } from '../lib/discover-comparison.js';

export function DiscoverComparison({anime, saved = [], onSave, onPreferences}) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random()*10000));
  const [pool] = useState(() => saved.map(a => ({a, n: Math.random()})).sort((a,b) => a.n-b.n).map(x => x.a));
  const [status,setStatus] = useState('');
  const [selectedId,setSelectedId] = useState(null);
  useEffect(() => () => onSave?.([], anime.id), [anime.id]);
  const rotated = pool.length ? [...pool.slice(seed % pool.length), ...pool.slice(0,seed % pool.length)] : [];
  const choice = comparisonChoices(anime, rotated, seed);
  const required = choice ? (choice.kind === 0 ? [anime, choice.a] : [choice.a, choice.b]) : [];
  const sources = required.map(a => a?.image ? (document.documentElement.dataset.hosting === 'pages' ? a.image : '/api/image?url='+encodeURIComponent(a.image)) : '');
  const imageKey = JSON.stringify(sources);
  const [loadedKey, setLoadedKey] = useState(null);
  useEffect(() => {
    let active = true;
    const images = [];
    const timers = [];
    if (sources.length && sources.every(Boolean)) {
      Promise.all(sources.map(src => new Promise(resolve => {
        const img = new Image(); images.push(img);
        const timer = setTimeout(() => resolve(false), 10000); timers.push(timer);
        img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0); };
        img.onerror = () => { clearTimeout(timer); resolve(false); };
        img.src = src;
      }))).then(results => { if (active && results.every(Boolean)) setLoadedKey(imageKey); });
    }
    return () => { active = false; timers.forEach(clearTimeout); images.forEach(img => {img.onload = img.onerror = null;}); };
  }, [imageKey]);
  const ready = loadedKey === imageKey && sources.length > 0 && sources.every(Boolean);
  const imageSource = a => document.documentElement.dataset.hosting === 'pages' ? a.image : '/api/image?url='+encodeURIComponent(a.image);
  function cover(a) { if (!a?.image) return null; return <img src={imageSource(a)} alt="" width="96" height="144" onError={() => setLoadedKey(null)} />; }
  function choose(selected, kind) {
    const entries = selected[0]?.id === selectedId ? [] : selected;
    setSelectedId(entries[0]?.id ?? null);
    onSave?.(entries.map(anime => ({anime,kind})), anime.id);
    setStatus(entries.length ? 'Selected · pending' : 'No preference selected');
  }
  function tile(a, label, selected, kind) {
    return <button type="button" className="comparison-choice" aria-pressed={selectedId === a.id} title={primaryTitle(a)} onClick={() => choose(selected,kind)}>
      {selectedId === a.id && <span className="comparison-selected" aria-hidden="true">✓</span>}{cover(a)}
      <span><small>{label}</small><strong>{primaryTitle(a)}</strong></span>
    </button>;
  }
  if (!choice) return <section className="discover-comparison"><strong>Build your next-watch shortlist</strong><p>Save an anime with Would watch to unlock quick comparisons here.</p><button type="button" onClick={onPreferences}>Explore your viewing preferences</button></section>;
  const {kind,a,b} = choice;
  const headings = ['Which would you start first?', null, 'What would you pair this with?', 'Which lineup would you choose?'];
  return <section className="discover-comparison" aria-label="Optional watchlist comparison" aria-hidden={!ready} style={{visibility: ready ? "visible" : "hidden"}}>
    <header><strong>{headings[kind]}</strong><span>Optional</span></header>
    <div className={'comparison-options variant-'+kind}>
      {kind === 0 && <>{tile(anime,'This pick',[anime],'head')}{tile(a,'Your watchlist',[a],'head')}</>}
      {kind === 2 && <>{tile(a,'Pair with this pick',[a],'companion')}{tile(b,'Pair with this pick',[b],'companion')}</>}
      {kind === 3 && <>{tile(a,'This pick +',[a],'lineup')}{tile(b,'This pick +',[b],'lineup')}</>}
    </div>
    <footer><button type="button" onClick={() => choose([],'head')}>No preference</button><span role="status" title="Your selection saves when you react to this anime or press Skip. Undo discards it.">{status}</span><button type="button" onClick={() => {choose([],'head');setSeed(n=>n+1);setStatus('');}}>Another question</button></footer>
  </section>;
}
