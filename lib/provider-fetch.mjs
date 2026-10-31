/** Share Tenrai's public-IP budget across media, catalog and background jobs.
 * Other providers and authenticated account requests pass through untouched.
 * Public limits: https://api.tenrai.org/documentation (120/minute, 4/second). */
export function createProviderFetch(
  fetcher = fetch,
  { spacingMs = 650, now = Date.now } = {},
) {
  const queue = [];
  let active = 0,
    nextAt = 0,
    retryAt = 0,
    timer;
  const limited = () =>
    new Response(null, {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((retryAt - now()) / 1000))),
      },
    });
  const pump = () => {
    clearTimeout(timer);
    if (retryAt > now()) {
      for (const job of queue.splice(0)) {
        job.cleanup();
        job.resolve(limited());
      }
      return;
    }
    if (active >= 2 || !queue.length) return;
    const delay = nextAt - now();
    if (delay > 0) {
      timer = setTimeout(pump, delay);
      return;
    }
    const index = queue.findIndex((job) => job.priority);
    const job = queue.splice(index < 0 ? 0 : index, 1)[0];
    job.cleanup();
    if (job.signal?.aborted) {
      job.reject(job.signal.reason);
      pump();
      return;
    }
    active++;
    nextAt = now() + spacingMs;
    Promise.resolve()
      .then(() => fetcher(job.input, job.options))
      .then((response) => {
        if (response.status === 429) {
          const raw = response.headers.get("Retry-After");
          const seconds = raw === null ? NaN : Number(raw);
          const duration = Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(raw) - now();
          retryAt =
            now() +
            Math.max(1000, Number.isFinite(duration) ? duration : 60000);
          response = new Response(response.body, response);
          response.headers.set(
            "Retry-After",
            String(Math.max(1, Math.ceil((retryAt - now()) / 1000))),
          );
        }
        job.resolve(response);
      }, job.reject)
      .finally(() => {
        active--;
        pump();
      });
    pump();
  };
  return (input, options) => {
    const url = new URL(
      typeof input === "string" ? input : input.url || String(input),
    );
    if (url.hostname !== "api.tenrai.org") return fetcher(input, options);
    const signal = options?.signal || input?.signal;
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (retryAt > now()) return Promise.resolve(limited());
    if (queue.length >= 64)
      return Promise.resolve(
        new Response(null, { status: 429, headers: { "Retry-After": "30" } }),
      );
    return new Promise((resolve, reject) => {
      const job = {
        input,
        options,
        signal,
        resolve,
        reject,
        priority: /\/(?:videos|pictures)$/.test(url.pathname),
      };
      const abort = () => {
        const index = queue.indexOf(job);
        if (index >= 0) {
          queue.splice(index, 1);
          job.cleanup();
          reject(signal.reason);
          pump();
        }
      };
      job.cleanup = () => signal?.removeEventListener("abort", abort);
      signal?.addEventListener("abort", abort, { once: true });
      queue.push(job);
      pump();
    });
  };
}
