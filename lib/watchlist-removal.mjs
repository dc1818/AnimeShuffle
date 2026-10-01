import { AppError } from "./mal.mjs";

/** Check private, live MAL status immediately before a user-confirmed deletion. */
export async function removeMalPlan(mal, session, id, confirmed = false) {
  const current = await mal.request(`/anime/${id}?fields=my_list_status`, {
    session,
  });
  const status = current.my_list_status;
  if (!status) return { removed: true };
  if (status.status !== "plan_to_watch")
    throw new AppError(
      "This anime is no longer Plan to Watch on MyAnimeList. Refresh your list before removing it; its MAL entry was kept.",
      409,
    );
  if (confirmed !== true) return { confirmationRequired: true };
  await mal.request(`/anime/${id}/my_list_status`, {
    session,
    method: "DELETE",
  });
  return { removed: true };
}
