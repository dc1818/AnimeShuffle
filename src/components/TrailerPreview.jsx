import { useCallback, useEffect, useRef, useState } from "react";

// Public trailer links survive card/tab remounts; never cache errors or user data.
const trailerCache = new Map();
function cachedTrailer(id) {
  const entry = trailerCache.get(id);
  if (entry?.expires > Date.now()) return entry.data;
  trailerCache.delete(id);
  return null;
}

/** Mounted with the anime ID as its React key: switching cards stops playback. */
export function TrailerPreview({ anime }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(() => cachedTrailer(anime.id));
  const [error, setError] = useState("");
  const [playerLoaded, setPlayerLoaded] = useState(false);
  const controller = useRef(null);
  const pending = useRef(null);
  const trigger = useRef(null);
  const wasOpened = useRef(false);

  // Hover, idle warming and a click share the same request. Warming never loads
  // YouTube, blocks reactions, or changes the current Discover selection.
  const load = useCallback(() => {
    const cached = cachedTrailer(anime.id);
    if (cached) {
      setResult(cached);
      return Promise.resolve(cached);
    }
    if (pending.current && !controller.current?.signal.aborted)
      return pending.current;
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(() => request.abort(), 12000);
    const promise = (async () => {
      const response = await fetch(`/api/trailer/${anime.id}`, {
        signal: request.signal,
      });
      if (!response.ok)
        throw new Error("Couldn’t load the preview. Try again.");
      const data = await response.json();
      if (
        data.videoId !== null &&
        !/^[A-Za-z0-9_-]{11}$/.test(data.videoId || "")
      )
        throw new Error("Preview unavailable.");
      if (request.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
      trailerCache.set(anime.id, {
        data,
        expires: Date.now() + (data.videoId ? 86400000 : 3600000),
      });
      if (trailerCache.size > 100)
        trailerCache.delete(trailerCache.keys().next().value);
      setResult(data);
      return data;
    })().finally(() => {
      clearTimeout(timeout);
      if (controller.current === request) pending.current = null;
    });
    pending.current = promise;
    return promise;
  }, [anime.id]);
  const warm = useCallback(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    // A short delay avoids looking up trailers for rapidly skipped cards and
    // gives the initial card and its next-anime prefetch priority.
    const timer = setTimeout(warm, 800);
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, [warm]);
  useEffect(() => {
    if (!open && wasOpened.current) trigger.current?.focus();
  }, [open]);

  async function play() {
    wasOpened.current = true;
    setOpen(true);
    setPlayerLoaded(false);
    setError("");
    try {
      await load();
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
      else if (controller.current?.signal.aborted)
        setError("Preview took too long to load. Try again.");
    }
  }
  function close() {
    setOpen(false);
    setError("");
  }
  const video = result?.videoId;
  return (
    <>
      <button
        ref={trigger}
        className="watch-preview"
        onClick={play}
        onPointerEnter={warm}
        onFocus={warm}
        aria-expanded={open}
        hidden={open}
      >
        <span aria-hidden="true">▶</span> Watch preview
      </button>
      {open && (
        <div
          className="trailer-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          <div className="trailer-toolbar">
            <span>Preview</span>
            <button onClick={close} autoFocus>
              Back to cover
            </button>
          </div>
          {video ? (
            <iframe
              title={`${anime.title} promotional trailer`}
              src={`https://www.youtube-nocookie.com/embed/${video}?autoplay=1&mute=1&playsinline=1&rel=0`}
              onLoad={() => setPlayerLoaded(true)}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="trailer-status" role="status">
              {error ||
                (result
                  ? "No preview is available for this anime yet."
                  : "Loading preview…")}
              {error && <button onClick={play}>Try again</button>}
            </div>
          )}
          <div className="trailer-footer">
            {video ? (
              <a
                href={`https://www.youtube.com/watch?v=${video}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {playerLoaded
                  ? "Playback unavailable? Open on YouTube ↗"
                  : "Opening player… Open on YouTube ↗"}
              </a>
            ) : (
              "Promotional trailers may contain spoilers."
            )}
          </div>
        </div>
      )}
    </>
  );
}
