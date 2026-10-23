import { useEffect, useRef, useState } from "react";
import { TrailerPreview } from "./TrailerPreview.jsx";
import { coverUrl } from "./AnimeCard.jsx";

/** Start covers well ahead of scrolling, without requesting an entire large list.
 * Direct CDN images avoid the image proxy round trip; the proxy remains a fallback.
 */
export function WatchlistCover({ anime, priority = false }) {
  const ref = useRef(null);
  const [nearby, setNearby] = useState(priority);
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (priority || nearby) return;
    if (!globalThis.IntersectionObserver) {
      setNearby(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearby(true);
          observer.disconnect();
        }
      },
      { rootMargin: "2400px 0px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [priority, nearby]);
  const src = fallback ? coverUrl(anime) : anime.image;
  return (
    <div className="saved-image" ref={ref}>
      {src && !failed ? (
        <img
          src={priority || nearby ? src : undefined}
          alt={anime.title}
          width="300"
          height="370"
          decoding="async"
          fetchPriority={priority ? "high" : "low"}
          onError={() => {
            if (!fallback && coverUrl(anime) !== anime.image) setFallback(true);
            else setFailed(true);
          }}
        />
      ) : (
        <span className="cover-unavailable">Cover unavailable</span>
      )}
      {document.documentElement.dataset.hosting !== "pages" && (
        <TrailerPreview anime={anime} eager={false} />
      )}
    </div>
  );
}
