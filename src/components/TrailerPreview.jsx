import {
  blockTrailer,
  useBlockedTrailers,
} from "../lib/playback-availability.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cachedMedia, prepareMedia, observeMedia } from "../lib/media-cache.js";
import { loadYouTubeAPI } from "../lib/youtube.js";
import { preparedPreview } from "../lib/card-media.js";
import { catalogPreview } from "../lib/media-data.js";
import { InlineTrailer } from "./InlineTrailer.jsx";

const PreviewGroup = createContext(null);

/** One expanded preview per collection, including while metadata is loading. */
export function TrailerPreviewGroup({ children }) {
  const [active, setActive] = useState(null);
  const value = useMemo(() => ({ active, setActive }), [active]);
  return (
    <PreviewGroup.Provider value={value}>{children}</PreviewGroup.Provider>
  );
}

/** Keyed by anime ID: changing cards disposes its player. Closing only pauses it. */
export function TrailerPreview({ anime, eager = true }) {
  const blocked = useBlockedTrailers();
  const group = useContext(PreviewGroup);
  const owner = useRef(Symbol("preview"));
  const [localOpen, setLocalOpen] = useState(false);
  const open = group ? group.active === owner.current : localOpen;
  function setOpen(next) {
    if (!group) return setLocalOpen(next);
    // Late results from a previous card must not close the new active preview.
    group.setActive((current) =>
      next ? owner.current : current === owner.current ? null : current,
    );
  }
  const setActive = group?.setActive;
  useEffect(() => {
    const token = owner.current;
    return () => setActive?.((current) => (current === token ? null : current));
  }, [setActive]);
  const [result, setResult] = useState(
    () =>
      cachedMedia(anime.id) || catalogPreview(anime) || preparedPreview(anime),
  );
  const [started, setStarted] = useState(false);
  const mounted = useRef(false),
    trigger = useRef(null),
    closeButton = useRef(null),
    wasOpened = useRef(false);
  const load = useCallback(
    (options) =>
      (catalogPreview(anime) && !blocked.has(anime.previewVideoId)
        ? Promise.resolve(cachedMedia(anime.id) || catalogPreview(anime))
        : prepareMedia(anime, "trailer", options)
      ).then((data) => {
        if (mounted.current) {
          setResult(data);
        }
        return data;
      }),
    [anime.id, anime.previewVideoId, anime.previewRegionChecked, blocked],
  );
  const warm = useCallback(() => {
    if (!result || result.fallback) void load();
  }, [load, result]);
  useEffect(() => {
    mounted.current = true;
    const stop = observeMedia(anime, "trailer", setResult, {
      start: eager && (!result || !!result.fallback),
    });
    return () => {
      mounted.current = false;
      stop();
    };
  }, [anime.id, eager]);
  useEffect(() => {
    if (open) closeButton.current?.focus({ preventScroll: true });
    else if (wasOpened.current && (!group || group.active === null)) {
      wasOpened.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [open]);
  async function play() {
    wasOpened.current = true;
    setOpen(true);
    setStarted(true);
    // Start API boot and metadata lookup together on this explicit playback click.
    loadYouTubeAPI().catch(() => {});
    const data = await load({ force: true });
    if (mounted.current && !data.trailers.some((t) => !blocked.has(t.videoId)))
      setOpen(false);
  }
  const video = result?.trailers.find((t) => !blocked.has(t.videoId))?.videoId;
  function unavailable(id, reason) {
    if (![100, 101, 150].includes(reason)) {
      // A stalled player or transient playback error does not remove a trailer.
      setOpen(false);
      setStarted(false);
      return;
    }
    blockTrailer(id);
    setResult(null);
    prepareMedia(anime).then((data) => {
      if (!mounted.current) return;
      setResult(data);
      if (
        !data.trailers.some((t) => t.videoId !== id && !blocked.has(t.videoId))
      )
        setOpen(false);
    });
  }
  return (
    <>
      <button
        ref={trigger}
        className="watch-preview artwork-preview"
        aria-label={`Preview ${anime.title}`}
        onClick={play}
        onPointerEnter={warm}
        onFocus={warm}
        disabled={!!result && !result.fallback && !video}
        aria-busy={(eager || started) && (!result || !!result.fallback)}
        aria-expanded={open}
        hidden={open}
      >
        {!result || result.fallback || video ? (
          <span className="artwork-play" aria-hidden="true">
            ▶
          </span>
        ) : (
          <span className="artwork-unavailable">No preview</span>
        )}
      </button>
      {started && (
        <div
          className="trailer-panel"
          hidden={!open}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <div className="trailer-toolbar">
            <span>Preview</span>
            <button ref={closeButton} onClick={() => setOpen(false)}>
              <span aria-hidden="true">←</span> Back to cover
            </button>
          </div>
          {video ? (
            <InlineTrailer
              videoId={video}
              title={`${anime.title} promotional trailer`}
              active={open}
              onUnavailable={unavailable}
            />
          ) : (
            <div className="trailer-status" role="status">
              <span className="media-spinner" aria-hidden="true" />
              Preparing preview…
            </div>
          )}
          <div className="trailer-footer">
            Promotional trailers may contain spoilers.
          </div>
        </div>
      )}
    </>
  );
}
