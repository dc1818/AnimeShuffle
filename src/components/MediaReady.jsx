import { useEffect, useState } from "react";
import {
  cardMediaKey,
  cardMediaReady,
  prepareCardMedia,
} from "../lib/card-media.js";
/** Reveal only after artwork (or its native fallback) and preview selection are ready. */
export function MediaReady({ anime, children }) {
  return (
    <MediaReadyContent key={cardMediaKey(anime)} anime={anime}>
      {children}
    </MediaReadyContent>
  );
}
function MediaReadyContent({ anime, children }) {
  const [ready, setReady] = useState(() => cardMediaReady(anime));

  useEffect(() => {
    let current = true;
    prepareCardMedia(anime).then(() => {
      if (current) setReady(true);
    });
    return () => {
      current = false;
    };
  }, [anime.id, anime.image, anime.previewVideoId, anime.previewRegionChecked]);
  if (ready) return children;
  return (
    <div
      className="media-empty card-media-loading"
      role="status"
      aria-busy="true"
    >
      <span className="media-spinner" aria-hidden="true" />
      <p>Preparing your next pick…</p>
    </div>
  );
}
