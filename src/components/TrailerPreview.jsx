import {
  blockTrailer,
  useBlockedTrailers,
} from "../lib/playback-availability.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { cachedMedia, prepareMedia } from "../lib/media-cache.js";
import { loadYouTubeAPI } from "../lib/youtube.js";
import { preparedPreview } from "../lib/card-media.js";
import { catalogPreview } from "../lib/media-data.js";
import { InlineTrailer } from "./InlineTrailer.jsx";

/** Keyed by anime ID: changing cards disposes its player. Closing only pauses it. */
export function TrailerPreview({ anime, eager = true }) {
  const blocked = useBlockedTrailers();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(
    () =>
      preparedPreview(anime) || cachedMedia(anime.id) || catalogPreview(anime),
  );
  const [started, setStarted] = useState(false);
  const mounted = useRef(false),
    trigger = useRef(null),
    closeButton = useRef(null),
    wasOpened = useRef(false);
  const load = useCallback(
    () =>
      (catalogPreview(anime) && !blocked.has(anime.previewVideoId)
        ? Promise.resolve(cachedMedia(anime.id) || catalogPreview(anime))
        : prepareMedia(anime)
      ).then((data) => {
        if (mounted.current) {
          setResult(data);
        }
        return data;
      }),
    [anime.id, anime.previewVideoId, anime.previewRegionChecked, blocked],
  );
  const warm = useCallback(() => {
    // Keep the prepared cover-only choice stable until explicit playback.
    if (!result) void load();
  }, [load, result]);
  useEffect(() => {
    mounted.current = true;
    if (eager && !result) warm();
    return () => {
      mounted.current = false;
    };
  }, [warm, eager]);
  useEffect(() => {
    if (open) closeButton.current?.focus();
    else if (wasOpened.current) trigger.current?.focus();
  }, [open]);
  async function play() {
    wasOpened.current = true;
    setOpen(true);
    setStarted(true);
    // Start API boot and metadata lookup together on this explicit playback click.
    loadYouTubeAPI().catch(() => {});
    const data = await load();
    if (mounted.current && !data.trailers.some((t) => !blocked.has(t.videoId)))
      setOpen(false);
  }
  const video = result?.trailers.find((t) => !blocked.has(t.videoId))?.videoId;
  function unavailable(id) {
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
        disabled={!video && eager}
        aria-busy={(eager || started) && !result}
        aria-expanded={open}
        hidden={open || (!!result && !video) || (eager && !video)}
      >
        <span className="artwork-play" aria-hidden="true">
          ▶
        </span>
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
