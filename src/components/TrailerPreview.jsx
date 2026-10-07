import { useEffect, useRef, useState } from "react";

/** Mounted with the anime ID as its React key: switching cards stops playback. */
export function TrailerPreview({ anime }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const controller = useRef(null);
  const trigger = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!open && controller.current) trigger.current?.focus();
  }, [open]);
  async function play() {
    setOpen(true);
    setError("");
    if (result) return;
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    try {
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
      if (!request.signal.aborted) setResult(data);
    } catch (err) {
      if (!request.signal.aborted) setError(err.message);
    }
  }
  function close() {
    controller.current?.abort();
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
                Playback unavailable? Open on YouTube ↗
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
