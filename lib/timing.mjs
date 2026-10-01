/** Request-scoped metrics: no URLs, account identifiers or provider payloads. */
export function requestTiming(client, enabled) {
  const started = performance.now();
  const timing = { queueMs: 0, upstreamMs: 0, cacheHits: 0 };
  return {
    mal: {
      ...client,
      request: (path, options = {}) =>
        client.request(path, {
          ...options,
          timing: enabled ? timing : undefined,
        }),
    },
    header() {
      if (!enabled) return "";
      return [
        ["server", performance.now() - started],
        ["mal_queue", timing.queueMs],
        ["mal", timing.upstreamMs],
        ["cache_hits", timing.cacheHits],
      ]
        .map(([name, value]) => `${name};dur=${Math.max(0, value).toFixed(1)}`)
        .join(", ");
    },
  };
}
