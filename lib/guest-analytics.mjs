import { createHmac } from "node:crypto";
import { AppError } from "./mal.mjs";
import { parseWatchlistBackup } from "../src/lib/watchlist.js";
import { normalizePreferences } from "../src/lib/preferences.js";
import { normalizeReactionReason } from "../src/lib/reaction-reasons.js";
import {
  GUEST_REACTION_LIMIT,
  validGuestToken,
} from "../src/lib/guest-analytics.js";

export function guestId(request, key) {
  const token = request.headers.get("X-AnimeShuffle-Guest");
  return key && validGuestToken(token)
    ? "guest:" +
        createHmac("sha256", key)
          .update("guest:" + token)
          .digest("hex")
    : null;
}

export function cleanGuestSnapshot(body) {
  if (
    !Array.isArray(body?.reactions) ||
    body.reactions.length > GUEST_REACTION_LIMIT
  )
    throw new AppError("Invalid guest snapshot.");
  if (
    !Number.isSafeInteger(body.totalReactions) ||
    body.totalReactions < body.reactions.length ||
    body.totalReactions > 1000000
  )
    throw new AppError("Invalid guest reaction count.");
  const seen = new Set();
  const compact = (a) => ({
    id: a.id,
    title: a.title,
    englishTitle: a.englishTitle,
    genres: a.genres,
    format: a.format,
    episodes: a.episodes,
    status: a.status,
  });
  const cleanAnime = (a, at) => {
    try {
      return parseWatchlistBackup(
        JSON.stringify({
          app: "anime-shuffle",
          version: 1,
          entries: [{ anime: a, addedAt: at }],
        }),
      )[0];
    } catch {
      throw new AppError("Invalid guest anime.");
    }
  };
  const reactions = body.reactions.map((r) => {
    if (
      !r ||
      !["good", "bad", "watch", "nope"].includes(r.action) ||
      seen.has(r.anime?.id)
    )
      throw new AppError("Invalid guest reaction.");
    const entry = cleanAnime(r.anime, r.at);
    if (
      ["good", "bad"].includes(r.action) &&
      entry.anime.status === "not_yet_aired"
    )
      throw new AppError("This anime has not aired yet.");
    seen.add(entry.anime.id);
    return {
      anime: compact(entry.anime),
      action: r.action,
      at: entry.addedAt,
      ...(normalizeReactionReason(r.reason)
        ? { reason: normalizeReactionReason(r.reason) }
        : {}),
    };
  });
  const preferences = normalizePreferences(body.preferences);
  preferences.favoriteAnime = preferences.favoriteAnime.map((a) =>
    compact(cleanAnime(a).anime),
  );
  return {
    reactions,
    preferences,
    onboardingComplete: body.onboardingComplete === true,
    totalReactions: body.totalReactions,
  };
}
