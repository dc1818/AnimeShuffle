import { useEffect, useRef, useState } from "react";
import { cachedMedia, loadMedia } from "../lib/media-cache.js";
import { trailerThumbnail } from "../lib/media-data.js";
import { InlineTrailer } from "./InlineTrailer.jsx";

/** Tabs fetch metadata only when visited. Selecting a trailer starts YouTube. */
export function AnimeMedia({ anime, kind, active }) {
  const [data, setData] = useState(() => cachedMedia(anime.id, kind));
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const imageButton = useRef(null);
  useEffect(() => {
    if (!active || data) return;
    let current = true;
    setError("");
    loadMedia(anime.id, kind)
      .then((value) => {
        if (current) setData(value);
      })
      .catch((err) => {
        if (current) setError(err.message);
      });
    return () => {
      current = false;
    };
  }, [anime.id, kind, active, data, attempt]);
  if (!data)
    return (
      <div className="media-empty" role="status">
        {!error && <span className="media-spinner" aria-hidden="true" />}
        {error || `Loading ${kind === "trailer" ? "trailers" : "images"}…`}
        {error && (
          <button onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        )}
      </div>
    );
  if (kind === "trailer")
    return (
      <div className="anime-media">
        <p className="media-note">
          Promotional videos listed on MyAnimeList. Trailers may contain
          spoilers.
        </p>
        {selected && (
          <InlineTrailer
            key={selected.videoId}
            videoId={selected.videoId}
            title={`${anime.title} · ${selected.title}`}
            active={active}
          />
        )}
        {data.trailers.length ? (
          <div className="media-trailers" aria-label="Available trailers">
            {data.trailers.map((t) => (
              <button
                key={t.videoId}
                aria-pressed={selected?.videoId === t.videoId}
                onClick={() => setSelected(t)}
              >
                <span className="media-trailer-frame">
                  <MediaImage
                    url={trailerThumbnail(t.videoId)}
                    alt={`${t.title} preview`}
                  />
                  <span className="media-play" aria-hidden="true">
                    ▶
                  </span>
                </span>
                <span className="media-trailer-title">{t.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <p>No promotional trailers are available for this anime yet.</p>
        )}
      </div>
    );
  const closeImage = () => {
    setExpanded(null);
    imageButton.current?.focus();
  };
  return (
    <div className="anime-media">
      <p className="media-note">
        Artwork from MyAnimeList’s image gallery. Select an image to enlarge it.
      </p>
      {expanded && (
        <div
          className="media-expanded"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeImage();
            }
          }}
        >
          <button onClick={closeImage} autoFocus>
            Back to images
          </button>
          <MediaImage
            key={expanded}
            url={expanded}
            alt={`${anime.title} artwork, enlarged`}
          />
        </div>
      )}
      <div className="media-gallery" hidden={!!expanded}>
        {data.pictures.map((p, i) => (
          <button
            key={p.image}
            aria-label={`Enlarge ${anime.title} image ${i + 1}`}
            onClick={(event) => {
              imageButton.current = event.currentTarget;
              setExpanded(p.image);
            }}
          >
            <span className="media-picture-frame">
              <MediaImage
                url={p.thumbnail || p.image}
                alt={`${anime.title} artwork ${i + 1}`}
              />
            </span>
          </button>
        ))}
      </div>
      {!data.pictures.length && (
        <p>No additional images are available for this anime yet.</p>
      )}
    </div>
  );
}
function MediaImage({ url, alt }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <span className="media-image" aria-busy={!failed && !loaded}>
      {!failed && !loaded && (
        <span className="media-image-loading">
          <span className="media-spinner" aria-hidden="true" />
        </span>
      )}
      {failed ? (
        <span className="media-image-error">Image unavailable</span>
      ) : (
        <img
          src={`/api/image?url=${encodeURIComponent(url)}`}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={loaded ? "is-loaded" : ""}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
