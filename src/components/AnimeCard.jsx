import { GenreBadges } from "./GenreBadges.jsx";
import { ReactionFeedback, reactionLabel } from "./ReactionFeedback.jsx";
import { paletteFromPixels } from "../lib/cover-palette.js";
import { englishTitle, primaryTitle } from "../lib/titles.js";
import { loadMedia } from "../lib/media-cache.js";
import { AnimeMedia } from "./AnimeMedia.jsx";
import { TrailerPreview } from "./TrailerPreview.jsx";
import { GenreFocus } from "./GenrePreferences.jsx";
import { AnimeTitle } from "./AnimeTitle.jsx";
import { isUnreleased, releaseLabel } from "../lib/release.js";
import { runtimeLabel } from "../lib/preferences.js";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { synopsisText } from "../lib/synopsis.js";
import { useDiscoverSwipe } from "./useDiscoverSwipe.js";
import { swipeLabels } from "../lib/discover-swipe.js";

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
  return paletteFromPixels(context.getImageData(0, 0, 24, 24).data);
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
  onWhy,
  onReact,
  onSkip,
  onUndo,
  dynamic,
  compact = false,
  tier,
  reason,
  saved = false,
  selectedGenres = [],
  restrictGenres = false,
  selectedThemes = [],
  selectedCategories = [],
  selectedNodes = [],
  restrictNodes = false,
  onPreferences,
  showGenreFocus = true,
}) {
  const previewsEnabled = document.documentElement.dataset.hosting !== "pages";
  const { drag, handlers: swipeHandlers } = useDiscoverSwipe({
    identity: anime.id,
    enabled: !compact,
    disabled: busy || reactionDisabled || !!detailsOpen,
    unreleased: isUnreleased(anime),
    onReact,
  });
  const image = useRef(null);
  const [failed, setFailed] = useState(false);
  const [sampled, setSampled] = useState(null);
  const coverKey = `${anime.id}:${anime.image || ""}`;
  useEffect(() => {
    setFailed(false);
    // Cached images may be complete before React receives their load event.
    if (image.current?.complete && image.current.naturalWidth) imageLoaded();
  }, [coverKey]);
  useEffect(() => {
    const palette = dynamic
      ? (sampled?.key === coverKey && sampled.palette) ||
        anime.palette || ["25, 100, 130", "129, 43, 77"]
      : ["20, 55, 70", "55, 38, 61"];
    document.body.style.setProperty("--cool", palette[0]);
    document.body.style.setProperty("--warm", palette[1]);
    // The cover layer also follows the active card when canvas sampling is blocked.
    document.body.style.setProperty(
      "--anime-cover",
      dynamic && anime.image && !failed
        ? `url(${JSON.stringify(coverUrl(anime))})`
        : "none",
    );
  }, [sampled, dynamic, anime.palette, coverKey, failed]);
  useEffect(
    () => () => {
      // A collapsed card or another page must not keep the previous anime's theme.
      document.body.style.removeProperty("--anime-cover");
      document.body.style.removeProperty("--cool");
      document.body.style.removeProperty("--warm");
    },
    [],
  );
  function imageLoaded() {
    setFailed(false);
    // Pixel access can fail when a browser blocks canvas; the default theme remains usable.
    try {
      setSampled({ key: coverKey, palette: coverPalette(image.current) });
    } catch {}
  }
  return (
    <article
      className={`anime-card ${compact ? "ranked-card" : "discover-card swipe-enabled"} ${drag ? "swipe-dragging" : ""} ${drag?.leaving ? "swipe-leaving" : ""} ${tier <= 3 ? "medal-" + tier : ""}`}
      style={
        drag
          ? {
              "--swipe-x": `${drag.x}px`,
              "--swipe-y": `${drag.y}px`,
              "--swipe-rotate": `${Math.max(-10, Math.min(10, drag.x / 20))}deg`,
            }
          : undefined
      }
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
      <div
        className={`poster-stage${previewsEnabled ? " has-preview" : ""}`}
        {...(!compact ? swipeHandlers : {})}
      >
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
            key={coverKey}
            ref={image}
            className="poster"
            width="300"
            height="450"
            fetchPriority={compact ? "auto" : "high"}
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
        {!compact && (
          <div className="swipe-feedback" aria-live="polite" role="status">
            {drag?.action && (
              <span
                className={`swipe-stamp ${drag.blocked ? "blocked" : drag.action}`}
              >
                {drag.blocked ? "Not aired yet" : swipeLabels[drag.action]}
                <small>
                  {drag.blocked
                    ? "Choose Would watch or Won’t watch"
                    : "Release to confirm"}
                </small>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="card-content">
        {!compact && (
          <p className="swipe-guide">Swipe the artwork</p>
        )}
        <div className="anime-summary">
          {compact ? (
            <h2>
              <AnimeTitle anime={anime} />
            </h2>
          ) : (
            <h1 id="anime-title" aria-live="polite">
              <AnimeTitle anime={anime} />
            </h1>
          )}
          <div className="metadata">
            {[
              anime.year,
              anime.format
                ? anime.format.replaceAll("_", " ").toUpperCase()
                : null,
              anime.episodes ? `${anime.episodes} episodes` : null,
              compact && anime.duration ? `${anime.duration} min` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <p
            className={`release-status ${isUnreleased(anime) ? "unreleased" : ""}`}
          >
            {releaseLabel(anime)}
            {!compact && anime.duration
              ? ` · ${anime.duration} min/episode`
              : ""}
          </p>
          <p className="runtime-estimate">{runtimeLabel(anime)}</p>
        </div>
        <GenreBadges anime={anime} />
        {showGenreFocus && (
          <GenreFocus
            genres={selectedGenres}
            restricted={restrictGenres}
            themes={selectedThemes}
            categories={selectedCategories}
            nodes={selectedNodes}
            restrictNodes={restrictNodes}
            onChange={onPreferences}
          />
        )}
        {compact && reason && (
          <p className="match-reason">
            {reason}
            {saved ? " · On your watchlist" : ""}
          </p>
        )}
        <p className="synopsis">
          {synopsisText(anime.synopsis) || "No synopsis available."}
        </p>
        <div className={!compact || onWhy ? "discover-links" : undefined}>
          <button
            id={compact ? `details-toggle-${anime.id}` : "details-toggle"}
            className="details-toggle"
            aria-expanded={!!detailsOpen}
            aria-controls="details-card"
            onClick={onDetails}
          >
            <span>
              <Icon name="info" />
            </span>
            <span>
              {detailsOpen
                ? "Hide details"
                : compact && !onWhy
                  ? "More about this anime"
                  : "More details"}
            </span>
            <span>
              <Icon name="chevron" />
            </span>
          </button>
          {onWhy && (
            <button
              className="details-toggle why-toggle"
              aria-expanded={detailsOpen === "why"}
              aria-controls="details-card"
              onClick={onWhy}
            >
              <span>
                <Icon name="compass" />
              </span>
              <span>Why this pick?</span>
              <span>
                <Icon name="chevron" />
              </span>
            </button>
          )}
        </div>
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
                  drag?.leaving ||
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
              <button
                disabled={busy}
                onClick={onSkip}
                title="Not now: hide this anime for 7 days without teaching a dislike. Undo brings it back sooner."
              >
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
  initialTab = "synopsis",
  showWhy = true,
  responsive = false,
  modal = false,
  loading = false,
  error = "",
  reactions = {},
  onSaveFeedback,
}) {
  const panel = useRef(null);
  const tabId = useId();
  const feedbackTrigger = useRef(null);
  const restoreFeedbackFocus = useRef(false);
  const [editingId, setEditingId] = useState(null);
  const eligible = Object.values(reactions).filter(
    (r) => r?.anime?.id && reactionLabel(r.action),
  );
  const recent = eligible.sort(
    (a, b) => (Number(b.at) || 0) - (Number(a.at) || 0),
  )[0];
  const editing = eligible.find(
    (r) => String(r.anime.id) === String(editingId),
  );
  function backToWhy() {
    restoreFeedbackFocus.current = true;
    setEditingId(null);
  }
  useEffect(() => {
    if (!editing && restoreFeedbackFocus.current) {
      feedbackTrigger.current?.focus();
      restoreFeedbackFocus.current = false;
    }
  }, [editing]);
  const mediaEnabled = document.documentElement.dataset.hosting !== "pages";
  const tabs = [
    "Synopsis",
    "Details",
    ...(mediaEnabled ? ["Trailers", "Images"] : []),
    ...(showWhy ? ["Why this pick?"] : []),
  ];
  const [activeTab, setActiveTab] = useState(
    showWhy && initialTab === "why" ? tabs.length - 1 : 0,
  );
  // A direct explanation request opens Why; ordinary details starts at Synopsis.
  useEffect(() => {
    setActiveTab(showWhy && initialTab === "why" ? tabs.length - 1 : 0);
    setEditingId(null);
  }, [anime.id, initialTab, showWhy]);
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
  const overlay = modal || (responsive && narrow);
  useEffect(() => {
    if (!overlay) return;
    const element = panel.current;
    const overflow = document.body.style.overflow;
    // Capture before showModal moves focus into the dialog. React removes the
    // node before effect cleanup, so native focus restoration alone is unreliable.
    const opener = document.activeElement;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [overlay]);
  useEffect(() => {
    if (overlay) return;
    const outside = (event) => {
      // React can remove the clicked thumbnail/feedback button before this listener.
      // The original propagation path still records where the click started.
      if (
        event.composedPath().includes(panel.current) ||
        panel.current?.contains(event.target)
      )
        return;
      // Keep the opening toggle and any foreground dialog in charge of their own clicks.
      if (event.target.closest?.('.details-toggle, dialog, [role="dialog"]'))
        return;
      if (document.querySelector('dialog[open], [role="dialog"]')) return;
      onClose();
    };
    // Wait for click: closing on pointerdown reflows the card before pointerup,
    // so the original reaction button can lose its click. React handlers run first.
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [overlay, onClose]);
  useEffect(() => {
    if (!responsive) return;
    const element = panel.current;
    const trigger = document.activeElement;
    const selected = element?.querySelector(
      '[role="tab"][aria-selected="true"]',
    );
    selected?.focus({ preventScroll: true });
    if (!overlay) element?.scrollIntoView?.({ block: "nearest" });
    return () => {
      // Return keyboard users to their opener, without stealing focus from a
      // reaction or another control they deliberately clicked outside the panel.
      if (
        trigger?.isConnected &&
        (element?.contains(document.activeElement) ||
          document.activeElement === document.body)
      ) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [anime.id, initialTab, overlay, responsive]);
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
              if (editing) backToWhy();
              else onClose();
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
      className={`details-card${modal ? " details-modal" : ""}${editing ? " feedback-active" : ""}`}
      aria-labelledby="details-heading"
    >
      {editing ? (
        <ReactionFeedback
          key={`${editing.anime.id}:${editing.action}:${editing.at}`}
          reaction={editing}
          onSave={onSaveFeedback}
          onDone={backToWhy}
          onClose={onClose}
          headingId="details-heading"
        />
      ) : (
        <>
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
            {loading && <p role="status">Loading full details…</p>}
            {error && <p role="alert">{error}</p>}
            {!!anime.prequels?.length && (
              <p className="runtime-estimate">
                This is a separate entry in a series. Your reaction and
                watchlist save apply to this entry.
              </p>
            )}
            <div
              className={`details-tabs${mediaEnabled ? " with-media" : ""}${showWhy ? "" : " without-why"}`}
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
                  onPointerEnter={() => {
                    const kind =
                      label === "Trailers"
                        ? "trailer"
                        : label === "Images"
                          ? "pictures"
                          : null;
                    if (kind) void loadMedia(anime.id, kind).catch(() => {});
                  }}
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
                  {anime.episodeTaste.complete &&
                  anime.episodeTaste.filler === 0
                    ? "No episodes are marked as filler."
                    : `${anime.episodeTaste.filler} of ${anime.episodeTaste.total} checked episodes are marked as filler.`}
                  {anime.episodeTaste.recap > 0 &&
                    ` ${anime.episodeTaste.recap} episodes are marked as recap.`}
                  {anime.episodeTaste.complete
                    ? " Full available episode list checked."
                    : " Partial coverage; this is not a full-series estimate."}
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
            {showWhy && (
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
                {recent && onSaveFeedback && (
                  <section
                    className="why-feedback-entry"
                    aria-label="Your recent reaction"
                  >
                    <span className="feedback-eyebrow">
                      YOUR RECENT REACTION
                    </span>
                    <div className="why-feedback-title">
                      {coverUrl(recent.anime) && (
                        <img
                          src={coverUrl(recent.anime)}
                          alt=""
                          loading="lazy"
                        />
                      )}
                      <div>
                        <strong>
                          {englishTitle(recent.anime) ||
                            primaryTitle(recent.anime)}
                        </strong>
                        <span className={`feedback-badge ${recent.action}`}>
                          {reactionLabel(recent.action)}
                        </span>
                      </div>
                    </div>
                    <button
                      ref={feedbackTrigger}
                      className="primary"
                      onClick={() => setEditingId(recent.anime.id)}
                    >
                      Add a reason for this reaction
                    </button>
                    <p className="feedback-hint">
                      About{" "}
                      {englishTitle(recent.anime) || primaryTitle(recent.anime)}
                      , which you marked {reactionLabel(recent.action)}.
                    </p>
                  </section>
                )}
              </div>
            )}
            <a
              className="external-button"
              href={`https://myanimelist.net/anime/${anime.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on MyAnimeList <Icon name="external" />
            </a>
          </div>
        </>
      )}
    </Panel>
  );
}
