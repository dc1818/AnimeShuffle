/** Public media identifiers are validated at both sides of the HTTP boundary. */
export const validVideoId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value);
export function normalizeTrailerResponse(data) {
  if (!data || typeof data !== "object")
    throw Error("Trailer details couldn’t load. Please try again.");
  const hasList = Array.isArray(data.trailers),
    seen = new Set();
  const trailers = (hasList ? data.trailers : [])
    .flatMap((item) => {
      if (!validVideoId(item?.videoId) || seen.has(item.videoId)) return [];
      seen.add(item.videoId);
      return [
        {
          videoId: item.videoId,
          title:
            typeof item.title === "string"
              ? item.title.slice(0, 160)
              : "Trailer",
        },
      ];
    })
    .slice(0, 40);
  // Rolling deployments and old responses may contain only { videoId }.
  // One malformed list entry must not hide other playable trailers.
  if (validVideoId(data.videoId) && !seen.has(data.videoId))
    trailers.unshift({ videoId: data.videoId, title: "Preview" });
  if (!hasList && !validVideoId(data.videoId) && data.videoId !== null)
    throw Error("Trailer details couldn’t load. Please try again.");
  if (hasList && data.trailers.length && !trailers.length)
    throw Error("Trailer details couldn’t load. Please try again.");
  return { videoId: trailers[0]?.videoId || null, trailers };
}
export function catalogPreview(anime) {
  return validVideoId(anime.previewVideoId)
    ? {
        videoId: anime.previewVideoId,
        trailers: [{ videoId: anime.previewVideoId, title: "Preview" }],
      }
    : null;
}
export const trailerThumbnail = (videoId) =>
  validVideoId(videoId)
    ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
    : null;
