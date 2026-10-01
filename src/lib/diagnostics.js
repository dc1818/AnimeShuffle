/** Opt-in, bounded performance records. Never log bodies, tokens, search text or account names. */
export function createDiagnostics({
  storage,
  logger = console,
  enabled = false,
} = {}) {
  let active = enabled;
  try {
    active ||= storage?.getItem("anime-shuffle:debug") === "1";
  } catch {}
  const records = [];
  function record(entry) {
    if (!active) return;
    const row = { ...entry };
    records.push(row);
    if (records.length > 200) records.shift();
    logger.log("[Anime Shuffle timing]", row);
  }
  return {
    get enabled() {
      return active;
    },
    on() {
      active = true;
      try {
        storage?.setItem("anime-shuffle:debug", "1");
      } catch {}
    },
    off() {
      active = false;
      try {
        storage?.removeItem("anime-shuffle:debug");
      } catch {}
    },
    clear() {
      records.length = 0;
    },
    report() {
      const rows = records.map((r) => ({ ...r }));
      logger.table(rows);
      return rows;
    },
    start(operation) {
      const start = performance.now();
      return () =>
        record({ operation, elapsedMs: Math.round(performance.now() - start) });
    },
    async request(fetcher, url, options) {
      const started = performance.now();
      const debug = active;
      const route = url.split("?")[0].replace(/\/\d+(?=\/|$)/g, "/:id");
      let response, failure;
      try {
        response = await fetcher(url, {
          ...options,
          headers: {
            ...options.headers,
            ...(debug ? { "X-AnimeShuffle-Debug": "1" } : {}),
          },
        });
        // Consume the response here so elapsed time includes body download and JSON parsing.
        const result = await response.json();
        return { response, result };
      } catch (error) {
        failure =
          error.name === "TimeoutError" || error.name === "AbortError"
            ? "timeout"
            : "request_failed";
        throw error;
      } finally {
        if (debug) {
          const metrics = {};
          for (const part of (
            response?.headers.get("Server-Timing") || ""
          ).split(",")) {
            const match = part
              .trim()
              .match(
                /^(server|coordinator_queue|mal_queue|mal|cache_hits);dur=([\d.]+)$/,
              );
            if (match) metrics[match[1]] = Number(match[2]);
          }
          record({
            route,
            method: options.method,
            status: response?.status || 0,
            elapsedMs: Math.round(performance.now() - started),
            ...metrics,
            ...(failure ? { failure } : {}),
          });
        }
      }
    },
  };
}
