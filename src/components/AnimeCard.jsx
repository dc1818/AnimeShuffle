import { loadMedia } from "../lib/media-cache.js";
import { AnimeMedia } from "./AnimeMedia.jsx";
import { TrailerPreview } from "./TrailerPreview.jsx";
import { genreLabel } from "../lib/genres.js";
import { GenreFocus } from "./GenrePreferences.jsx";
import { AnimeTitle } from "./AnimeTitle.jsx";
import { isUnreleased, releaseLabel } from "../lib/release.js";
import { runtimeLabel } from "../lib/preferences.js";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { synopsisText } from "../lib/synopsis.js";

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
    const rgb = [...pixels.slice(index, index + 2)];
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
  selectionNote = "",
  reactionDisabled = false,
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
  selectedGenres = [],
  onPreferences,
}) {
  const previewsEnabled =
    !compact && document.documentElement.dataset.hosting !== "pages";
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
      <div className={`poster-stage${previewsEnabled ? " has-preview" : ""}`}>
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
        {previewsEnabled && <TrailerPreview key={anime.id} anime={anime} />}
      </div>
      <div className="card-content">
        {compact ? (
          <h2>
            <AnimeTitle anime={anime} />
          </h2>
        ) : (
          <h1 id="anime-title" aria-live="polite">
            <AnimeTitle anime={anime} />
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
              {genreLabel(genre)}
            </span>
          ))}
        </div>
        <GenreFocus genres={selectedGenres} onChange={onPreferences} />
        <p className="synopsis">
          {synopsisText(anime.synopsis) || "No synopsis available."}
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
        {selectionNote && (
          <p className="runtime-estimate" role="status">
            {selectionNote}
          </p>
        )}
        <div className="reaction-labels">
          <span>Seen it</span>
          <span>Not seen it</span>
        </div>
        <div className="reactions" aria-label="Your reaction">
          {actions.map(([action, label, icon, meaning], index) => (
            <Fragment key={action}>
              {(index === 0 || index === 2) && (
                <span className="mobile-reaction-label">
                  {index === 0 ? "Seen it" : "Not seen it"}
                </span>
              )}
              <button
                key={action}
                className={`reaction ${action}`}
                disabled={
                  busy ||
                  reactionDisabled ||
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
            </Fragment>
          ))}
        </div>
        {(!compact || onUndo) && (
          <div className="secondary-actions">
            <button disabled={busy || !canUndo} onClick={onUndo}>
              <Icon name="undo" />
              {compact ? "Undo this choice" : "Undo"}
            </button>
            {!compact && (
              <button disabled={busy} onClick={onSkip}>
                <Icon name="skip" />
                Skip
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function AnimeDetails({
  anime,
  reason,
  reasons,
  onClose,
  responsive = false,
}) {
  const panel = useRef(null);
  const tabId = useId();
  const mediaEnabled = document.documentElement.dataset.hosting !== "pages";
  const tabs = [
    "Synopsis",
    "Details",
    ...(mediaEnabled ? ["Trailers", "Images"] : []),
    "Why this pick?",
  ];
  const [activeTab, setActiveTab] = useState(0);
  useEffect(() => {
    if (!mediaEnabled) return;
    // Warm small metadata responses while the synopsis is being read. Actual
    // pictures and video players still load only in their respective media views.
    const timer = setTimeout(() => {
      loadMedia(anime.id, "trailer").catch(() => {});
      loadMedia(anime.id, "pictures").catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [anime.id, mediaEnabled]);
  // Each anime starts at its synopsis, including when a parent reuses this panel.
  useEffect(() => {
    setActiveTab(0);
  }, [anime.id]);
  function changeTab(event, index) {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(next);
    panel.current.querySelectorAll('[role="tab"]')[next].focus();
  }
  const [narrow, setNarrow] = useState(
    () => window.matchMedia?.("(max-width: 900px)").matches || false,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 900px)");
    if (!media) return;
    const changed = () => setNarrow(media.matches);
    changed();
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const overlay = responsive && narrow;
  useEffect(() => {
    if (!overlay) return;
    const element = panel.current;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, [overlay]);
  const Panel = overlay ? "dialog" : "aside";
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
    <Panel
      ref={panel}
      onCancel={
        overlay
          ? (event) => {
              event.preventDefault();
              onClose();
            }
          : undefined
      }
      onClick={
        overlay
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              const rect = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
              )
                onClose();
            }
          : undefined
      }
      id="details-card"
      className="details-card"
      aria-labelledby="details-heading"
    >
      <div className="details-header">
        <button
          className="icon-button close"
          aria-label="Close anime details"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
        <span className="eyebrow">About this anime</span>
        <h2 id="details-heading">
          <AnimeTitle anime={anime} />
        </h2>
        {!!anime.prequels?.length && (
          <p className="runtime-estimate">
            This is a separate entry in a series. Your reaction and watchlist
            save apply to this entry.
          </p>
        )}
        <div
          className={`details-tabs${mediaEnabled ? " with-media" : ""}`}
          role="tablist"
          aria-label="Anime information"
        >
          {tabs.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              id={`${tabId}-tab-${index}`}
              aria-controls={`${tabId}-panel-${index}`}
              aria-selected={activeTab === index}
              tabIndex={activeTab === index ? 0 : -1}
              onClick={() => setActiveTab(index)}
              onKeyDown={(event) => changeTab(event, index)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="details-body" key={anime.id}>
        <div
          role="tabpanel"
          id={`${tabId}-panel-0`}
          aria-labelledby={`${tabId}-tab-0`}
          hidden={activeTab !== 0}
          tabIndex={0}
        >
          <p className="full-synopsis">
            {synopsisText(anime.synopsis) || "No synopsis available."}
          </p>
        </div>
        <div
          role="tabpanel"
          id={`${tabId}-panel-1`}
          aria-labelledby={`${tabId}-tab-1`}
          hidden={activeTab !== 1}
          tabIndex={0}
        >
          {anime.episodeTaste?.total > 0 && (
            <p className="episode-coverage">
              {anime.episodeTaste.filler} of {anime.episodeTaste.total} checked
              episodes marked as filler · {anime.episodeTaste.recap} marked as
              recap.
              {anime.episodeTaste.complete
                ? " Full available episode list checked."
                : " Partial coverage; this is not a full-series estimate."}
              {
                " Flags supplied by Tenrai; filler is separate from canon status or pacing."
              }
            </p>
          )}
          <dl className="detail-facts">
            {Object.entries(facts).map(([name, value]) => (
              <div className="fact" key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {mediaEnabled &&
          ["trailer", "pictures"].map((kind, index) => (
            <div
              key={kind}
              role="tabpanel"
              id={`${tabId}-panel-${index + 2}`}
              aria-labelledby={`${tabId}-tab-${index + 2}`}
              hidden={activeTab !== index + 2}
              tabIndex={0}
            >
              <AnimeMedia
                key={`${anime.id}-${kind}`}
                anime={anime}
                kind={kind}
                active={activeTab === index + 2}
              />
            </div>
          ))}
        <div
          role="tabpanel"
          id={`${tabId}-panel-${tabs.length - 1}`}
          aria-labelledby={`${tabId}-tab-${tabs.length - 1}`}
          hidden={activeTab !== tabs.length - 1}
          tabIndex={0}
        >
          <div className="why-card">
            <Icon name="shuffle" />
            <div>
              <h3>Why this pick?</h3>
              <ul className="why-reasons">
                {(reasons?.length
                  ? reasons
                  : [reason || "Something new for your next watch."]
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
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
      </div>
    </Panel>
  );
}
