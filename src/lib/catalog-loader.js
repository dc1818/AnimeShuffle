import { createCandidateCatalog } from "../../lib/candidate-catalog.mjs";
import { publicProviderFetch } from "./public-provider.js";

// Reuse the exact server query, normalization and seeded page permutation.
// Detail verification and all personal exclusions still run in the store.
const browserCatalog = createCandidateCatalog({
  fetcher: publicProviderFetch,
  interval: 0, // The shared public-provider queue owns spacing/concurrency.
});
export const publicCatalogPage = (url) =>
  browserCatalog.page(new URL(url, "https://animeshuffle.com"));

/** A warm same-origin cache wins immediately. A stalled hosted read may join
 * one public browser read of the SAME catalog page, not a different ranking.
 * Only after both paths fail does the store use its existing MAL fallback. */
export function loadCatalogPage(
  url,
  request,
  { publicPage = null, hedgeMs = 1200, onSource = () => {} } = {},
) {
  if (!publicPage) return request(url);
  return new Promise((resolve, reject) => {
    let settled = false, secondary = false, failed = 0, primaryError;
    const finish = (page, source) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onSource(source);
      resolve(page);
    };
    const fail = (error) => {
      if (settled) return;
      if (++failed === 2) {
        settled = true;
        clearTimeout(timer);
        reject(primaryError || error);
      }
    };
    const recover = () => {
      if (secondary || settled) return;
      secondary = true;
      Promise.resolve().then(() => publicPage(url))
        .then((page) => finish(page, "browser"), fail);
    };
    const timer = setTimeout(recover, hedgeMs);
    Promise.resolve().then(() => request(url)).then(
      (page) => finish(page, "server"),
      (error) => {
        if (settled) return;
        primaryError = error;
        // Validation/authentication failures are not a provider outage.
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          settled = true;
          clearTimeout(timer);
          reject(error);
          return;
        }
        fail(error);
        recover();
      },
    );
  });
}
