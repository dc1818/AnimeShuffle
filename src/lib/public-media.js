import { createProviderFetch } from "../../lib/provider-fetch.mjs";
import { countryCode, regionAllows } from "../../lib/media-region.mjs";
import { validImage } from "../../lib/mal.mjs";
import { normalizeTrailerResponse, validVideoId } from "./media-data.js";

// Tenrai explicitly supports public browser clients. Use that public endpoint
// only when the shared backend quota is exhausted; never send account headers.
const publicFetch = createProviderFetch((input, options) =>
  fetch(input, options),
);
export async function loadPublicMedia(id, kind, country, signal) {
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    id > 10000000 ||
    !["trailer", "pictures"].includes(kind)
  )
    throw Error("Invalid media request.");
  const response = await publicFetch(
    `https://api.tenrai.org/v1/anime/${id}/${kind === "trailer" ? "videos" : "pictures"}`,
    {
      signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    const error = Error("Media is being prepared.");
    error.retryable = false;
    if (response.status === 429)
      error.retryAfterMs = Math.max(
        1000,
        (Number(response.headers.get("Retry-After")) || 60) * 1000,
      );
    throw error;
  }
  const body = await response.json();
  if (kind === "trailer") {
    if (!Array.isArray(body?.data?.promo))
      throw Error("Invalid trailer response.");
    return normalizeTrailerResponse({
      trailers: body.data.promo.flatMap((p) => {
        const t = p?.trailer;
        return validVideoId(t?.youtube_id) &&
          t.embeddable !== false &&
          t.privacy_status !== "private" &&
          regionAllows(t.region_restriction, countryCode(country))
          ? [{ videoId: t.youtube_id, title: p.title || "Preview" }]
          : [];
      }),
    });
  }
  if (!Array.isArray(body?.data)) throw Error("Invalid artwork response.");
  const seen = new Set();
  const pictures = [];
  for (const p of body.data) {
    const image = [
      p?.jpg?.large_image_url,
      p?.webp?.large_image_url,
      p?.jpg?.image_url,
      p?.webp?.image_url,
    ].find(validImage);
    if (!image || seen.has(image)) continue;
    seen.add(image);
    pictures.push({
      image,
      thumbnail:
        [p?.jpg?.image_url, p?.webp?.image_url].find(validImage) || image,
    });
    if (pictures.length === 60) break;
  }
  return { pictures };
}
