// Reuse scores across tab switches and unrelated store updates. Keep just one
// input snapshot; fresh reactions, MAL metadata or preferences invalidate it.
let cached;
export function cachedWatchlistReasons(reactions, list, preferences) {
  return cached?.reactions === reactions &&
    cached.list === list &&
    cached.preferences === preferences
    ? cached.reasons
    : null;
}
export function cachedWatchlistScores(reactions, list, preferences) {
  return cached?.reactions === reactions &&
    cached.list === list &&
    cached.preferences === preferences
    ? cached.scores
    : null;
}
export function rankWatchlist(reactions, list, preferences) {
  if (
    cached?.reactions === reactions &&
    cached.list === list &&
    cached.preferences === preferences
  )
    return cached.promise;
  cached?.cancel?.();
  const entry = { reactions, list, preferences };
  cached = entry;
  entry.promise = new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./watchlist-worker.js", import.meta.url),
      { type: "module" },
    );
    let timer;
    const finish = (error, result) => {
      clearTimeout(timer);
      worker.terminate();
      entry.cancel = null;
      if (error) {
        if (cached === entry) cached = null;
        reject(error);
      } else {
        entry.scores = result;
        resolve(result);
      }
    };
    entry.cancel = () => finish(new Error("Watchlist changed"));
    worker.onmessage = ({ data }) => {
      entry.reasons = data.reasons || {};
      finish(null, data.scores || data);
    };
    worker.onerror = () => finish(new Error("Watchlist ranking unavailable"));
    timer = setTimeout(
      () => finish(new Error("Watchlist ranking timed out")),
      30000,
    );
    try {
      worker.postMessage({ reactions, list, preferences });
    } catch (error) {
      finish(error);
    }
  });
  return entry.promise;
}
