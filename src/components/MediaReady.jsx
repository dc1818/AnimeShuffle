import { useEffect, useState, useRef } from "react";
import {
  cardMediaKey,
  cardMediaReady,
  prepareCardMedia,
} from "../lib/card-media.js";
/** Reveal only after artwork (or its native fallback) and preview selection are ready. */
export function MediaReady({ anime, children, onReady }) {
  return (
    <MediaReadyContent key={cardMediaKey(anime)} anime={anime} onReady={onReady}>
      {children}
    </MediaReadyContent>
  );
}
function MediaReadyContent({ anime, children, onReady }) {
  const [ready, setReady] = useState(() => cardMediaReady(anime));
  const reported = useRef(false);

  useEffect(() => {
    if (!ready || reported.current) return;
    // This effect runs after React commits the revealed card, not just after
    // the recommendation store selects a title behind the media gate.
    reported.current = true;
    onReady?.(anime.id);
  }, [ready, anime.id, onReady]);

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
