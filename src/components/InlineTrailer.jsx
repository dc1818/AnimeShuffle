import { useEffect, useRef, useState } from "react";
import { loadYouTubeAPI } from "../lib/youtube.js";

const players = new Set();
const playbackError = (code) => {
  if ([101, 150].includes(code))
    return "This trailer’s publisher doesn’t allow playback here. Try another trailer or open it on YouTube.";
  if (code === 100)
    return "This trailer was removed or made private. Try another trailer.";
  if (code === 153)
    return "YouTube couldn’t identify this player. Check your browser’s privacy settings or open it on YouTube.";
  return "This trailer couldn’t play. Retry or choose another trailer.";
};

/** Keep the player mounted while the cover is shown. Pause immediately, including
 * when a slow onReady/PLAYING event arrives after the user has already closed it. */
export function InlineTrailer({
  videoId,
  title,
  active = true,
  onUnavailable,
}) {
  const host = useRef(null),
    player = useRef(null),
    ready = useRef(false);
  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;
  const visible = useRef(active);
  visible.current = active;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let disposed = false,
      instance;
    setStatus("loading");
    setError("");
    setSlow(false);
    ready.current = false;
    const container = host.current;
    loadYouTubeAPI()
      .then((YT) => {
        if (disposed) return;
        // Set referrer policy before navigation. The site-wide no-referrer policy
        // otherwise causes YouTube error 153 in some browsers.
        const frame = document.createElement("iframe");
        frame.title = title;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.allow =
          "autoplay; encrypted-media; fullscreen; picture-in-picture";
        frame.allowFullscreen = true;
        frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&autoplay=0&mute=1&playsinline=1&rel=0`;
        container.replaceChildren(frame);
        instance = new YT.Player(frame, {
          events: {
            onReady: (event) => {
              if (disposed) return;
              ready.current = true;
              event.target.mute();
              setStatus("ready");
              if (visible.current) event.target.playVideo();
              else event.target.pauseVideo();
            },
            onStateChange: (event) => {
              if (disposed) return;
              if (!visible.current && [1, 3].includes(event.data)) {
                event.target.pauseVideo();
                return;
              }
              if (event.data === 1) {
                for (const other of players)
                  if (other !== event.target) other.pauseVideo?.();
              }
              setStatus(
                {
                  0: "ended",
                  1: "playing",
                  2: "paused",
                  3: "buffering",
                  5: "ready",
                }[event.data] || "loading",
              );
            },
            onAutoplayBlocked: () => {
              if (!disposed) setStatus("blocked");
            },
            onError: (event) => {
              if (!disposed) {
                if (
                  [100, 101, 150].includes(event.data) &&
                  unavailable.current
                ) {
                  unavailable.current(videoId);
                  return;
                }
                setError(playbackError(event.data));
                setStatus("error");
              }
            },
          },
        });
        player.current = instance;
        players.add(instance);
      })
      .catch((err) => {
        if (!disposed) {
          setError(err.message);
          setStatus("error");
        }
      });
    return () => {
      disposed = true;
      ready.current = false;
      players.delete(instance);
      instance?.destroy();
      container.replaceChildren();
      player.current = null;
    };
  }, [videoId, title, attempt]);
  useEffect(() => {
    if (!ready.current) return;
    if (active) player.current?.playVideo();
    else player.current?.pauseVideo();
  }, [active]);
  const waiting = ["loading", "ready", "buffering"].includes(status);
  useEffect(() => {
    setSlow(false);
    if (!active || !waiting) return;
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(timer);
  }, [active, waiting, attempt]);
  const message =
    error ||
    (slow
      ? "Taking longer than expected. You can retry the player."
      : {
          loading: "Loading YouTube player…",
          ready: "Starting preview…",
          buffering: "Buffering preview…",
          blocked: "Your browser paused autoplay. Press Play to start.",
          paused: "Preview paused.",
          ended: "Preview finished.",
        }[status]);
  return (
    <div className="inline-trailer">
      <div className="inline-trailer-frame" ref={host} />
      <div className="inline-trailer-feedback">
        {message && (
          <span role="status">
            {waiting && !slow && (
              <span className="media-spinner" aria-hidden="true" />
            )}
            {message}
          </span>
        )}
        {["blocked", "paused", "ended"].includes(status) && (
          <button onClick={() => player.current?.playVideo()}>Play</button>
        )}
        {(error || slow) && (
          <button onClick={() => setAttempt((n) => n + 1)}>Retry player</button>
        )}
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open on YouTube ↗
        </a>
      </div>
    </div>
  );
}
