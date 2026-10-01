/** MAL's release status is authoritative; unknown is never presented as released. */
export const isUnreleased = (anime) => anime.status === "not_yet_aired";
export function releaseLabel(anime) {
  return (
    {
      not_yet_aired: "Not yet aired",
      currently_airing: "Currently airing",
      finished_airing: "Finished airing",
    }[anime.status] || "Release status unknown"
  );
}
