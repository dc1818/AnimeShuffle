import { useEffect, useState } from "react";
import {
  cardMediaKey,
  cardMediaReady,
  prepareCardMedia,
} from "../lib/card-media.js";
/** Don't mount the card or record an exposure until its cover and preview lookup settle successfully. */
export function MediaReady({ anime, children, onSkip }) {
  return (
    <MediaReadyContent key={cardMediaKey(anime)} anime={anime} onSkip={onSkip}>
      {children}
    </MediaReadyContent>
  );
}
function MediaReadyContent({ anime, children, onSkip }) {
  const [ready, setReady] = useState(() => cardMediaReady(anime));
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setError("");
    prepareCardMedia(anime).then(
      () => {
        if (current) setReady(true);
      },
      (err) => {
        if (current) setError(err.message);
      },
    );
    return () => {
      current = false;
    };
  }, [
    anime.id,
    anime.image,
    anime.previewVideoId,
    anime.previewRegionChecked,
    attempt,
  ]);
  if (ready) return children;
  return (
    <div
      className="media-empty card-media-loading"
      role="status"
      aria-busy={!error}
    >
      {!error && <span className="media-spinner" aria-hidden="true" />}
      <p>{error || "Loading cover and preview details…"}</p>
      {error && (
        <button onClick={() => setAttempt((n) => n + 1)}>Retry media</button>
      )}
      {error && onSkip && <button onClick={onSkip}>Skip this anime</button>}
    </div>
  );
}
