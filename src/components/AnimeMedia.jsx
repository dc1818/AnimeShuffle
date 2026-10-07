import {
  blockTrailer,
  useBlockedTrailers,
} from "../lib/playback-availability.js";
import { useEffect, useRef, useState } from "react";
import { cachedMedia, loadMedia } from "../lib/media-cache.js";
import { trailerThumbnail } from "../lib/media-data.js";
import { InlineTrailer } from "./InlineTrailer.jsx";

/** Tabs fetch metadata only when visited. Selecting a trailer starts YouTube. */
export function AnimeMedia({ anime, kind, active }) {
  const blocked = useBlockedTrailers();
  const [data, setData] = useState(() => cachedMedia(anime.id, kind));
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(null);

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
        {selected && !blocked.has(selected.videoId) && (
          <InlineTrailer
            key={selected.videoId}
            videoId={selected.videoId}
            title={`${anime.title} · ${selected.title}`}
            active={active}
            onUnavailable={(id) => {
              blockTrailer(id);
              setSelected(null);
            }}
          />
        )}
        {data.trailers.some((t) => !blocked.has(t.videoId)) ? (
          <div className="media-trailers" aria-label="Available trailers">
            {data.trailers
              .filter((t) => !blocked.has(t.videoId))
              .map((t) => (
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
          <p>No playable trailers are available for this anime here.</p>
        )}
      </div>
    );
  return (
    <ImageGallery
      key={anime.id}
      anime={anime}
      pictures={data.pictures}
      active={active}
    />
  );
}

/** One full image at a time; adjacent images warm only after opening this tab. */
function ImageGallery({ anime, pictures, active }) {
  const [index, setIndex] = useState(0);
  const touch = useRef(null),
    currentDot = useRef(null);
  const count = pictures.length;
  const move = (delta) => setIndex((i) => (i + delta + count) % count);
  useEffect(() => {
    if (!active || count < 2) return;
    // Decode only neighbors, not the whole gallery. Browser cache serves a swipe.
    const images = [
      ...new Set([(index + 1) % count, (index - 1 + count) % count]),
    ].map((i) => {
      const image = new window.Image();
      image.src = `/api/image?url=${encodeURIComponent(pictures[i].image)}`;
      return image;
    });
    currentDot.current?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
    return () => {
      for (const image of images) image.removeAttribute("src");
    };
  }, [active, index, count, pictures]);
  if (!count)
    return <p>No additional images are available for this anime yet.</p>;
  return (
    <div
      className="anime-media image-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={`${anime.title} images`}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      <p className="media-note">
        Artwork from MyAnimeList. Use the arrows or swipe to browse.
      </p>
      <div
        className="image-carousel-stage"
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.isPrimary === false) {
            touch.current = null;
            return;
          }
          if (event.pointerType === "mouse" && event.button !== 0) return;
          touch.current = {
            x: event.clientX,
            y: event.clientY,
            id: event.pointerId,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerCancel={() => {
          touch.current = null;
        }}
        onPointerUp={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start || start.id !== event.pointerId) return;
          const dx = event.clientX - start.x,
            dy = event.clientY - start.y;
          if (
            count > 1 &&
            Math.abs(dx) > 40 &&
            Math.abs(dx) > Math.abs(dy) * 1.25
          )
            move(dx < 0 ? 1 : -1);
        }}
      >
        <MediaImage
          key={pictures[index].image}
          url={pictures[index].image}
          alt={`${anime.title} image ${index + 1} of ${count}`}
        />
      </div>
      <div className="image-carousel-controls">
        <button
          aria-label="Previous image"
          disabled={count < 2}
          onClick={() => move(-1)}
        >
          ‹
        </button>
        <span role="status" aria-live="polite">
          {index + 1} / {count}
        </span>
        <button
          aria-label="Next image"
          disabled={count < 2}
          onClick={() => move(1)}
        >
          ›
        </button>
      </div>
      <div className="image-carousel-dots" aria-label="Choose an image">
        {pictures.map((p, i) => (
          <button
            key={p.image}
            ref={i === index ? currentDot : undefined}
            aria-label={`Show image ${i + 1} of ${count}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => setIndex(i)}
          >
            <span />
          </button>
        ))}
      </div>
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
          draggable={false}
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
