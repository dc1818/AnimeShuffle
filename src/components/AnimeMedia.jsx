import {
  blockTrailer,
  useBlockedTrailers,
} from "../lib/playback-availability.js";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { cachedMedia, prepareMedia } from "../lib/media-cache.js";
import { trailerThumbnail } from "../lib/media-data.js";
import { imageSources } from "../lib/media-artwork.js";
import { ArtworkFallback } from "./ArtworkFallback.jsx";
import { InlineTrailer } from "./InlineTrailer.jsx";
import { loadYouTubeAPI } from "../lib/youtube.js";

/** Prepare both media tabs when details opens; playback still needs a click. */
export function AnimeMedia({ anime, kind, active }) {
  const blocked = useBlockedTrailers();
  const [data, setData] = useState(() => cachedMedia(anime.id, kind));
  const [selected, setSelected] = useState(null);
  const [unavailable, setUnavailable] = useState(null);
  const [visited, setVisited] = useState(active);
  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);

  useEffect(() => {
    if (data) return;
    let current = true;
    prepareMedia(anime, kind).then((value) => {
      if (current) setData(value);
    });
    return () => {
      current = false;
    };
  }, [anime.id, kind, data]);
  // Prepare metadata now; defer image downloads until a tab is visited.
  // Retain visited players and galleries when switching tabs.
  if (!active && !visited) return null;
  if (!data)
    return (
      <div className="media-empty" role="status">
        <span className="media-spinner" aria-hidden="true" />
        Preparing {kind === "trailer" ? "previews" : "artwork"}…
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
              setSelected(
                data.trailers.find(
                  (t) => t.videoId !== id && !blocked.has(t.videoId),
                ) || null,
              );
            }}
          />
        )}
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
                  onClick={() => {
                    setUnavailable(null);
                    setSelected(t);
                  }}
                >
                  <span className="media-trailer-frame">
                    <MediaImage
                      url={trailerThumbnail(t.videoId)}
                      fallback={anime.image}
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
          <div className="media-cover-fallback">
            <MediaImage url={anime.image} alt={`${anime.title} artwork`} />
            <a
              href={
                unavailable
                  ? `https://www.youtube.com/watch?v=${unavailable}`
                  : `https://myanimelist.net/anime/${anime.id}/video`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Explore videos ↗
            </a>
          </div>
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
    return (
      <div className="media-cover-fallback">
        <MediaImage url={anime.image} alt={`${anime.title} artwork`} />
      </div>
    );
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
                  fallback={anime.image}
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
              fallback={anime.image}
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
  return (
    <div className="media-tile" aria-busy={!loaded}>
      <TileReadiness.Provider value={setLoaded}>
        <button
          {...props}
          disabled={!loaded}
          style={{ visibility: loaded ? undefined : "hidden" }}
        >
          {children}
        </button>
        {!loaded && (
          <span className="media-tile-status" role="status">
            <span className="media-spinner" aria-hidden="true" />
          </span>
        )}
      </TileReadiness.Provider>
    </div>
  );
}
function MediaImage({ url, fallback, alt }) {
  const tileReady = useContext(TileReadiness);
  const image = useRef(null);
  const [index, setIndex] = useState(0),
    [loaded, setLoaded] = useState(false);
  const sources = [
    ...new Set([...imageSources(url), ...imageSources(fallback)]),
  ];
  const source = sources[index];
  const deadline = useRef(Date.now() + 2500);
  useEffect(() => {
    let current = true;
    if (!source) {
      setLoaded(true);
      tileReady?.(true);
      return;
    }
    const element = image.current;
    const fail = () => {
      if (!current) return;
      current = false;
      setIndex(Date.now() >= deadline.current ? sources.length : index + 1);
    };
    const load = () =>
      Promise.resolve()
        .then(() => element.decode?.())
        .then(() => {
          if (!current) return;
          clearTimeout(timer);
          setLoaded(true);
          tileReady?.(true);
        }, fail);
    const timer = setTimeout(fail, Math.max(0, deadline.current - Date.now()));
    element.addEventListener("load", load);
    element.addEventListener("error", fail);
    if (element.complete && element.naturalWidth) load();
    return () => {
      current = false;
      clearTimeout(timer);
      element.removeEventListener("load", load);
      element.removeEventListener("error", fail);
    };
  }, [source, index, tileReady]);
  return (
    <span className="media-image" aria-busy={!loaded}>
      {!loaded && (
        <span className="media-image-loading">
          <span className="media-spinner" aria-hidden="true" />
        </span>
      )}
      {source ? (
        <img
          key={source}
          ref={image}
          src={source}
          alt={alt}
          draggable={false}
          loading="eager"
          decoding="async"
          className={loaded ? "is-loaded" : ""}
        />
      ) : (
        <ArtworkFallback />
      )}
    </span>
  );
}
