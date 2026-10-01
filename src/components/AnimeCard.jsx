import { isUnreleased, releaseLabel } from "../lib/release.js";
import { runtimeLabel } from "../lib/preferences.js";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";

// Pages cannot proxy images; its sample covers load directly from MAL.
export const coverUrl = (anime) => {
  if (!anime.image) return undefined;
  return document.documentElement.dataset.hosting === "pages"
    ? anime.image
    : "/api/image?url=" + encodeURIComponent(anime.image);
};
const actions = [
  ["good", "Good", "thumbUp", "Seen it and liked it"],
  ["bad", "Bad", "thumbDown", "Seen it and disliked it"],
  ["watch", "Would watch", "bookmark", "Not seen it, interested"],
  ["nope", "Won’t watch", "ban", "Not seen it, not interested"],
];

/** Sample a small, same-origin cover rather than needing full-screen artwork. */
function coverPalette(image) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, 24, 24);
  const pixels = context.getImageData(0, 0, 24, 24).data;
  const colors = [];
  for (let index = 0; index < pixels.length; index += 4) {
    const rgb = [...pixels.slice(index, index + 3)];
    const max = Math.max(...rgb),
      min = Math.min(...rgb);
    if (max - min > 35 && max > 65 && max < 240) colors.push(rgb);
  }
  if (!colors.length) return null;
  const primary = colors[Math.floor(colors.length / 3)];
  const distance = (color) =>
    color.reduce((total, channel, i) => total + (channel - primary[i]) ** 2, 0);
  const secondary = colors.sort((a, b) => distance(b) - distance(a))[0];
  return [primary.join(", "), secondary.join(", ")];
}

/** React owns the card markup, event handlers, loading states and cover fallback. */
export function AnimeCard({
  anime,
  busy,
  canUndo,
  detailsOpen,
  onDetails,
  onReact,
  onSkip,
  onUndo,
  dynamic,
  compact = false,
  tier,
  reason,
  saved = false,
}) {
  const image = useRef(null);
  const [failed, setFailed] = useState(false);
  const [sampled, setSampled] = useState(null);
  useEffect(() => {
    if (compact) return;
    const palette = dynamic
      ? sampled || anime.palette || ["25, 100, 130", "129, 43, 77"]
      : ["20, 55, 70", "55, 38, 61"];
    document.body.style.setProperty("--cool", palette[0]);
    document.body.style.setProperty("--warm", palette[1]);
  }, [sampled, dynamic, anime.palette, compact]);
  function imageLoaded() {
    setFailed(false);
    // Pixel access can fail when a browser blocks canvas; the default theme remains usable.
    try {
      setSampled(coverPalette(image.current));
    } catch {}
  }
  return (
    <article
      className={`anime-card ${compact ? "ranked-card" : ""} ${tier <= 3 ? "medal-" + tier : ""}`}
      aria-label={compact ? anime.title : "Current anime"}
      aria-busy={busy}
    >
      {tier && (
        <div className="tier-badge">
          {tier === 1
            ? "Gold · "
            : tier === 2
              ? "Silver · "
              : tier === 3
                ? "Bronze · "
                : ""}
          Tier {tier}
        </div>
      )}
      <div className="poster-stage">
        <div
          className="poster-glow"
          style={{
            backgroundImage: anime.image
              ? `url("${coverUrl(anime)}")`
              : undefined,
          }}
        />
        {anime.image && (
          <img
            ref={image}
            className="poster"
            src={coverUrl(anime)}
            alt={`${anime.title} cover`}
            onLoad={imageLoaded}
            onError={() => setFailed(true)}
          />
        )}
        {(failed || !anime.image) && (
          <div className="poster-fallback">
            <Icon name="image" />
            <span>Cover unavailable</span>
          </div>
        )}
        <span className="media-badge">
          {(anime.format || "anime").replaceAll("_", " ").toUpperCase()}
        </span>
        <div className="poster-fade" />
      </div>
      <div className="card-content">
        {compact ? (
          <h2>{anime.title}</h2>
        ) : (
          <h1 id="anime-title" aria-live="polite">
            {anime.title}
          </h1>
        )}
        <p
          className={`release-status ${isUnreleased(anime) ? "unreleased" : ""}`}
        >
          {releaseLabel(anime)}
        </p>
        {compact && (
          <p className="match-reason">
            {reason}
            {saved ? " · On your watchlist" : ""}
          </p>
        )}
        <div className="metadata">
          {[
            anime.year,
            anime.episodes ? `${anime.episodes} episodes` : null,
            anime.duration ? `${anime.duration} min` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <p className="runtime-estimate">{runtimeLabel(anime)}</p>
        <div className="genres">
          {anime.genres?.map((genre) => (
            <span className="genre" key={genre}>
              {genre}
            </span>
          ))}
        </div>
        <p className="synopsis">
          {anime.synopsis || "Open the MyAnimeList page for more information."}
        </p>
        <button
          id={compact ? `details-toggle-${anime.id}` : "details-toggle"}
          className="details-toggle"
          aria-expanded={detailsOpen}
          aria-controls="details-card"
          onClick={onDetails}
        >
          <span>
            <Icon name="info" />
          </span>
          <span>{detailsOpen ? "Hide details" : "More about this anime"}</span>
          <span>
            <Icon name="chevron" />
          </span>
        </button>
        <div className="reaction-labels">
          <span>Seen it</span>
          <span>Not seen it</span>
        </div>
        <div className="reactions" aria-label="Your reaction">
          {actions.map(([action, label, icon, meaning], index) => (
            <button
              key={action}
              className={`reaction ${action}`}
              disabled={
                busy ||
                (["good", "bad"].includes(action) && isUnreleased(anime))
              }
              title={
                ["good", "bad"].includes(action) && isUnreleased(anime)
                  ? "Unavailable: this anime has not aired yet"
                  : `${meaning}${compact ? "" : ` (${index + 1})`}`
              }
              onClick={() => onReact(action)}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {!compact && <kbd>{index + 1}</kbd>}
            </button>
          ))}
        </div>
        {!compact && (
          <div className="secondary-actions">
            <button disabled={busy || !canUndo} onClick={onUndo}>
              <Icon name="undo" />
              Undo
            </button>
            <button disabled={busy} onClick={onSkip}>
              <Icon name="skip" />
              Skip
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function AnimeDetails({ anime, reason, onClose }) {
  const ratingLabels = {
    g: "G · All ages",
    pg: "PG · Children",
    pg_13: "PG-13 · Teens 13+",
    r: "R · 17+",
    r_plus: "R+ · Mild nudity",
    rx: "Rx · Explicit",
  };
  const facts = {
    "MAL community score":
      anime.score > 0
        ? `${anime.score.toFixed(2)} / 10${anime.scoreVotes ? ` · ${anime.scoreVotes.toLocaleString()} ratings` : ""}`
        : "Not yet scored",
    "Age rating": ratingLabels[anime.ageRating] || "Not provided by MAL",
    Format: (anime.format || "Unknown").toUpperCase(),
    Episodes: anime.episodes || "TBA",
    Year: anime.year || "TBA",
    Studio: anime.studios?.join(", ") || "Unknown",
    Status: releaseLabel(anime),
  };
  return (
    <aside
      id="details-card"
      className="details-card"
      aria-labelledby="details-heading"
    >
      <button
        className="icon-button close"
        aria-label="Close anime details"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      <span className="eyebrow">About this anime</span>
      <h2 id="details-heading">{anime.title}</h2>
      <p className="alternate-title">
        {anime.originalTitle !== anime.title ? anime.originalTitle : ""}
      </p>
      <p className="full-synopsis">
        {anime.synopsis || "No synopsis available."}
      </p>
      <dl className="detail-facts">
        {Object.entries(facts).map(([name, value]) => (
          <div className="fact" key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="why-card">
        <Icon name="shuffle" />
        <div>
          <h3>Why this pick?</h3>
          <p>
            {reason}. Your reactions shape future picks. Watching and Plan to
            Watch entries provide extra signals when MAL is connected.
          </p>
        </div>
      </div>
      <a
        className="external-button"
        href={`https://myanimelist.net/anime/${anime.id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        View on MyAnimeList <Icon name="external" />
      </a>
    </aside>
  );
}
