import {
  blockTrailer,
  useBlockedTrailers,
} from "../lib/playback-availability.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { cachedMedia, loadMedia } from "../lib/media-cache.js";
import { loadYouTubeAPI } from "../lib/youtube.js";
import { catalogPreview } from "../lib/media-data.js";
import { InlineTrailer } from "./InlineTrailer.jsx";

/** Keyed by anime ID: changing cards disposes its player. Closing only pauses it. */
export function TrailerPreview({ anime }) {
  const blocked = useBlockedTrailers();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(
    () => cachedMedia(anime.id) || catalogPreview(anime),
  );
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const mounted = useRef(false),
    trigger = useRef(null),
    closeButton = useRef(null),
    wasOpened = useRef(false);
  const load = useCallback(
    () =>
      (catalogPreview(anime) && !blocked.has(anime.previewVideoId)
        ? Promise.resolve(cachedMedia(anime.id) || catalogPreview(anime))
        : loadMedia(anime.id)
      ).then((data) => {
        if (mounted.current) {
          setResult(data);
          setError("");
        }
        return data;
      }),
    [anime.id, anime.previewVideoId, anime.previewRegionChecked, blocked],
  );
  const warm = useCallback(() => {
    setError("");
    load().catch((err) => {
      if (mounted.current) setError(err.message);
    });
  }, [load]);
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(warm, 100);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [warm]);
  useEffect(() => {
    if (open) closeButton.current?.focus();
    else if (wasOpened.current) trigger.current?.focus();
  }, [open]);
  async function play() {
    wasOpened.current = true;
    setOpen(true);
    setStarted(true);
    setError("");
    // Start API boot and metadata lookup together on this explicit playback click.
    loadYouTubeAPI().catch(() => {});
    try {
      await load();
    } catch (err) {
      if (mounted.current) setError(err.message);
    }
  }
  const video = result?.trailers.find((t) => !blocked.has(t.videoId))?.videoId;
  function unavailable(id) {
    blockTrailer(id);
    setResult(null);
    loadMedia(anime.id)
      .then((data) => {
        if (mounted.current) setResult(data);
      })
      .catch((err) => {
        if (mounted.current) setError(err.message);
      });
  }
  return (
    <>
      <button
        ref={trigger}
        className="watch-preview"
        onClick={play}
        title={error || undefined}
        disabled={(!result && !error) || (result && !video && !error)}
        aria-busy={!result && !error}
        aria-expanded={open}
        hidden={open}
      >
        {!result && !error ? (
          <>
            <span className="media-spinner" aria-hidden="true" /> Preparing
            preview…
          </>
        ) : error ? (
          "Retry preview"
        ) : video ? (
          <>
            <span aria-hidden="true">▶</span> Watch preview
          </>
        ) : (
          "No preview available"
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
              Back to cover
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
              {!result && !error && (
                <span className="media-spinner" aria-hidden="true" />
              )}
              {error ||
                (result
                  ? "No playable preview is available for this anime here."
                  : "Finding preview…")}
              {error && <button onClick={play}>Try again</button>}
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
