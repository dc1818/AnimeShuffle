// Loaded only after a playback click. One promise serves every inline player.
let apiPromise;
export function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    const ready = () => {
      if (!window.YT?.Player) return fail();
      cleanup();
      previous?.();
      resolve(window.YT);
    };
    const cleanup = () => {
      clearTimeout(timer);
      if (window.onYouTubeIframeAPIReady === ready)
        window.onYouTubeIframeAPIReady = previous;
      script.onerror = null;
    };
    const fail = () => {
      cleanup();
      script.remove();
      apiPromise = null;
      reject(
        Error(
          "YouTube couldn’t load. Retry, or check your browser’s content blocker.",
        ),
      );
    };
    const timer = setTimeout(fail, 15000);
    window.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  });
  return apiPromise;
}
