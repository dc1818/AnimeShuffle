import {
  blockTrailer,
  useBlockedTrailers,
} from "../lib/playback-availability.js";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { cachedMedia, loadMedia } from "../lib/media-cache.js";
import { trailerThumbnail } from "../lib/media-data.js";
import { InlineTrailer } from "./InlineTrailer.jsx";
import { loadYouTubeAPI } from "../lib/youtube.js";

/** Prepare both media tabs when details opens; playback still needs a click. */
export function AnimeMedia({ anime, kind, active }) {
  const blocked = useBlockedTrailers();
  const [data, setData] = useState(() => cachedMedia(anime.id, kind));
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(null);
  const [unavailable, setUnavailable] = useState(null);
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);

  useEffect(() => {
    if (data) return;
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
  }, [anime.id, kind, data, attempt]);
  // Prepare metadata now; defer image downloads until a tab is visited.
  // Retain visited players and galleries when switching tabs.
  if (!active && !visited) return null;
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
              setUnavailable(id);
              blockTrailer(id);
              setSelected(null);
            }}
          />
        )}
        {unavailable && <p role="status" className="media-note">
          This trailer was removed, restricted, or cannot be embedded here.{' '}
          <a href={`https://www.youtube.com/watch?v=${unavailable}`} target="_blank" rel="noopener noreferrer">Check on YouTube</a>
          {' '}or choose another trailer.
        </p>}
        {data.trailers.some((t) => !blocked.has(t.videoId)) ? (
          <div className="media-trailers" aria-label="Available trailers">
            {data.trailers
              .filter((t) => !blocked.has(t.videoId))
              .map((t) => (
                <MediaTile
                  key={t.videoId}
                  aria-pressed={selected?.videoId === t.videoId}
                  onPointerEnter={() => loadYouTubeAPI().catch(() => {})}
                  onFocus={() => loadYouTubeAPI().catch(() => {})}
                  onClick={() => { setUnavailable(null); setSelected(t); }}
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
                </MediaTile>
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

/** Gallery on desktop, swipeable slideshow on phones; both views remain available. */
function ImageGallery({ anime, pictures, active }) {
  const [index, setIndex] = useState(0);
  const [view, setView] = useState(() =>
    window.matchMedia?.("(max-width: 560px)").matches ? "slideshow" : "gallery",
  );
  const touch = useRef(null),
    currentDot = useRef(null);
  const count = pictures.length;
  const move = (delta) => setIndex((i) => (i + delta + count) % count);
  useEffect(() => {
    if (!active || view !== "slideshow" || count < 2) return;
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
  }, [active, view, index, count, pictures]);
  useEffect(() => {
    if (!active || view !== "slideshow" || count < 2) return;
    // Listen outside the carousel so browsing works without first focusing it.
    // Leave arrow keys to text fields, menus and open dialogs.
    const onArrow = (event) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (
        event.target?.closest?.(
          'input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]',
        )
      )
        return;
      if (document.querySelector('[role="dialog"], dialog[open]')) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      setIndex(
        (i) => (i + (event.key === "ArrowRight" ? 1 : -1) + count) % count,
      );
    };
    window.addEventListener("keydown", onArrow);
    return () => window.removeEventListener("keydown", onArrow);
  }, [active, view, count]);
  if (!count)
    return <p>No additional images are available for this anime yet.</p>;
  return (
    <div
      className="anime-media image-carousel"
      role="region"
      aria-roledescription={view === "slideshow" ? "carousel" : undefined}
      aria-label={`${anime.title} images`}
    >
      <div className="image-view-switch" role="group" aria-label="Image view">
        <button
          aria-pressed={view === "gallery"}
          onClick={() => setView("gallery")}
        >
          Gallery
        </button>
        <button
          aria-pressed={view === "slideshow"}
          onClick={() => setView("slideshow")}
        >
          Slideshow
        </button>
      </div>
      <p className="media-note">
        {view === "gallery"
          ? "Artwork from MyAnimeList. Select an image to view it."
          : "Full artwork, fitted without enlargement. Use the arrows or swipe to browse."}
      </p>
      {view === "gallery" ? (
        <div className="media-gallery">
          {pictures.map((p, i) => (
            <MediaTile
              key={p.image}
              aria-label={`View image ${i + 1} of ${count}`}
              onClick={() => {
                setIndex(i);
                setView("slideshow");
              }}
            >
              <span className="media-picture-frame">
                <MediaImage
                  url={p.thumbnail || p.image}
                  alt={`${anime.title} artwork ${i + 1}`}
                />
              </span>
            </MediaTile>
          ))}
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

const TileReadiness = createContext(null);
function MediaTile({ children, ...props }) {
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return <div className="media-tile" aria-busy={loaded === false}>
    <TileReadiness.Provider key={attempt} value={setLoaded}>
      <button {...props} disabled={loaded !== true} style={{ visibility: loaded === true ? undefined : "hidden" }}>{children}</button>
      {loaded !== true && <span className="media-tile-status" role="status">
        {loaded === "failed" ? <>Thumbnail unavailable <button onClick={() => { setLoaded(false); setAttempt(n => n + 1); }}>Retry image</button></> : "Loading image…"}
      </span>}
    </TileReadiness.Provider>
  </div>;
}
function MediaImage({ url, alt }) {
  const tileReady = useContext(TileReadiness);
  const image = useRef(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let current = true;
    const element = image.current;
    if (!element) return;
    let done = false;
    const finish = (ok) => {
      if (!current || done) return;
      done = true;
      clearTimeout(timer);
      setLoaded(ok);
      setFailed(!ok);
      tileReady?.(ok ? true : "failed");
    };
    const load = () => {
      const decoded = element.decode ? element.decode() : Promise.resolve();
      decoded.then(() => finish(true), () => finish(false));
    };
    const error = () => finish(false);
    const timer = setTimeout(error, 12000);
    element.addEventListener("load", load);
    element.addEventListener("error", error);
    if (element.complete && element.naturalWidth) load();
    return () => {
      current = false;
      clearTimeout(timer);
      element.removeEventListener("load", load);
      element.removeEventListener("error", error);
    };
  }, [url, tileReady]);
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
          ref={image}
          src={`/api/image?url=${encodeURIComponent(url)}`}
          alt={alt}
          draggable={false}
          loading="eager"
          decoding="async"
          className={loaded ? "is-loaded" : ""}
        />
      )}
    </span>
  );
}
