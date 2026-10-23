import {
  reactionCount,
  RECOMMENDATION_MINIMUM,
} from "../lib/recommendation-access.js";
import { RecommendationExposure } from "./RecommendationExposure.jsx";
import { AnimeTitle } from "./AnimeTitle.jsx";
import { preparePreview } from "../lib/media-cache.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoadingIndicator, pendingWorkLabel } from "./LoadingIndicator.jsx";
import { Icon } from "./Icon.jsx";
import { AnimeCard, AnimeDetails, coverUrl } from "./AnimeCard.jsx";
import { buildTaste, tasteReadiness } from "../lib/recommend.js";
import {
  makeEvidenceExport,
  downloadEvidenceExport,
} from "../lib/evidence-export.js";

/** Accordion leaderboard: native buttons support Enter/Space and one expanded row at a time. */
export function Recommendations({ state, store, onDiscover, onPreferences }) {
  const count = useMemo(
    () => reactionCount(state.reactions),
    [state.reactions],
  );
  const unlocked =
    count >= RECOMMENDATION_MINIMUM || state.recommendationsReady;
  // Preserve batch order; current account state excludes newly saved/seen titles.
  const knownIds = useMemo(
    () =>
      new Set(
        [...state.list, ...state.preferences.favoriteAnime].map((anime) =>
          String(anime.id),
        ),
      ),
    [state.list, state.preferences.favoriteAnime],
  );
  const picks = useMemo(
    () =>
      state.recommendationPicks.filter(
        (pick) =>
          !state.reactions[pick.anime.id] &&
          !knownIds.has(String(pick.anime.id)),
      ),
    [state.recommendationPicks, state.reactions, knownIds],
  );
  const [lastChoice, setLastChoice] = useState(null);
  const choice = lastChoice && state.reactions[lastChoice.id];
  const confirmation = useRef(null);
  useEffect(() => {
    if (choice && document.activeElement === document.body)
      confirmation.current?.focus({ preventScroll: true });
  }, [lastChoice?.id, !!choice]);
  useEffect(() => {
    setLastChoice(null);
  }, [state.session?.account?.id]);
  const [detailsTab, setDetailsTab] = useState("synopsis");
  const [helpOpen, setHelpOpen] = useState(false);
  const [opened, setOpened] = useState(undefined);
  useEffect(() => {
    // Open the first row only after the complete verified batch is published.
    if (opened === undefined && picks.length) setOpened(picks[0].anime.id);
  }, [opened, picks[0]?.anime.id]);
  useEffect(() => {
    if (unlocked) store.visitRecommendations?.();
  }, [unlocked, store]);
  const [about, setAbout] = useState(null);
  const aboutAvailable = picks.some((pick) => pick.anime.id === about);
  const aboutReaction = state.reactions[about]?.action;
  useEffect(() => {
    if (!aboutAvailable || aboutReaction) setAbout(null);
  }, [aboutAvailable, aboutReaction]);
  useEffect(() => {
    if (
      unlocked &&
      !state.recommendationsReady &&
      !state.recommendationPicks.length &&
      state.ready &&
      state.onboardingComplete &&
      !state.busy
    ) {
      // The store guards overlapping requests, including StrictMode effects.
      store.loadRecommendations();
    }
  }, [
    unlocked,
    state.ready,
    state.onboardingComplete,
    state.busy,
    state.recommendationsReady,
    state.recommendationPicks.length,
    store,
  ]);
  const taste = useMemo(
    () => buildTaste(state.reactions, state.list, state.preferences, [], false),
    [state.reactions, state.list, state.preferences],
  );
  const readiness = useMemo(
    () => tasteReadiness(state.reactions, state.list, state.preferences, taste),
    [state.reactions, state.list, state.preferences, taste],
  );
  const hasTaste =
    state.preferences.favoriteGenres.length > 0 ||
    [...taste.records.values()].some((r) => r.weight !== 0);
  // Keep remaining picks in order until Refresh. Undo restores the original position.
  // Open the first pick initially; null means the user explicitly collapsed it.
  const openedId =
    opened === null
      ? null
      : picks.some((p) => p.anime.id === opened)
        ? opened
        : picks[0]?.anime.id;
  if (!unlocked)
    return (
      <section
        className="recommendations-page"
        aria-labelledby="recommendations-title"
      >
        <span className="eyebrow">Keep discovering</span>
        <h1 id="recommendations-title">
          Your recommendations are getting closer
        </h1>
        <p>
          React to 50 anime to unlock your top recommendations. Good, Bad, Would
          watch and Won’t watch all count.
        </p>
        <p>
          <strong>
            {count} / {RECOMMENDATION_MINIMUM} reactions
          </strong>{" "}
          · {RECOMMENDATION_MINIMUM - count} to go
        </p>
        <button className="primary" onClick={onDiscover}>
          Continue discovering
        </button>
      </section>
    );
  return (
    <section
      className="recommendations-page"
      aria-labelledby="recommendations-title"
    >
      <header className="recommendations-heading">
        <div>
          <div className="recommendations-title-row">
            <h1 id="recommendations-title">Recommendations</h1>
            <span className="recommendations-count">
              {picks.length} {picks.length === 1 ? "pick" : "picks"}
            </span>
          </div>
          <p>Your strongest matches, ready to discover.</p>
          <p className="recommendations-exclusions">
            Already saved, seen and rejected titles are excluded.
          </p>
        </div>
        <div className="recommendations-tools">
          <button
            className="primary"
            disabled={state.busy || state.recommendationsLoading || !hasTaste}
            onClick={() => {
              setOpened(undefined);
              setAbout(null);
              store.loadRecommendations({ force: true });
            }}
          >
            <Icon name="refresh" /> Refresh picks
          </button>
          <details className="recommendations-more">
            <summary aria-label="More recommendation options">···</summary>
            <div>
              <button
                className="quiet"
                disabled={
                  state.recommendationsLoading ||
                  (!picks.length && !state.recommendationPool?.length)
                }
                onClick={() =>
                  downloadEvidenceExport(
                    makeEvidenceExport([
                      ...picks.map((p) => p.anime),
                      ...(state.recommendationPool || []),
                    ]),
                  )
                }
              >
                Export recommendation candidates for research
              </button>
              <button
                className="quiet"
                disabled={state.busy || !state.canUndo}
                onClick={() => store.undo()}
              >
                Undo last reaction
              </button>
            </div>
          </details>
        </div>
      </header>
      <div className="recommendations-toolbar">
        <button className="recommendations-utility" onClick={onPreferences}>
          <Icon name="filters" />
          Viewing preferences
        </button>
        <button
          className="recommendations-utility"
          aria-expanded={helpOpen}
          aria-controls="recommendations-help"
          onClick={() => setHelpOpen((open) => !open)}
        >
          <Icon name="info" />
          <span>How picks work</span>
          <Icon name="chevron" />
        </button>
      </div>
      <section
        id="recommendations-help"
        className="recommendations-help"
        hidden={!helpOpen}
        aria-labelledby="recommendations-help-title"
      >
        <h2 id="recommendations-help-title">How recommendations work</h2>
        <p>
          Your favorites, reactions, viewing preferences and connected MAL list
          guide these picks; numeric ratings are optional.
        </p>
        <p>
          The remaining picks stay in order until you choose Refresh picks.
          Saving, rating or passing a title removes it from this list. Undo
          restores an eligible title to its original place. You may see fewer
          than 25 picks when eligible titles run low.
        </p>
      </section>
      {choice && (
        <div
          className="recommendation-confirmation"
          role="status"
          tabIndex={-1}
          ref={confirmation}
        >
          <span>
            <strong>{lastChoice.title}</strong> ·{" "}
            {
              {
                watch: "Saved to Watchlist",
                good: "Marked as liked",
                bad: "Marked as disliked",
                nope: "Passed",
              }[choice.action]
            }
          </span>
          <button
            className="quiet"
            disabled={state.busy || !state.undoableIds?.includes(lastChoice.id)}
            onClick={async () => {
              await store.undo(lastChoice.id);
              setOpened(lastChoice.id);
            }}
          >
            Undo
          </button>
          <button
            className="quiet"
            aria-label="Dismiss reaction confirmation"
            onClick={() => setLastChoice(null)}
          >
            ×
          </button>
        </div>
      )}
      {state.ready && readiness.needsMore && (
        <div className="shortlist-note" role="status">
          <strong>Still learning your taste</strong>
          <p>
            {readiness.reactionCount} reactions so far. {readiness.knownTitles}{" "}
            anime with usable genre signals from your choices and MAL history.
          </p>
          <p>
            {readiness.remaining > 0
              ? `Go back to Discover and react to about ${readiness.remaining} more anime to give us a better starting point.`
              : "Go back to Discover and mark a few anime Good or Would watch so we know what you enjoy."}{" "}
            Any picks below are early suggestions, not confident predictions.
          </p>
          <button className="primary" onClick={onDiscover}>
            Back to Discover
          </button>
        </div>
      )}
      {(state.recommendationsLoading && !picks.length) ||
      (!state.recommendationsReady &&
        !picks.length &&
        hasTaste &&
        !state.recommendationError) ? (
        <LoadingIndicator
          progress={state.recommendationProgress}
          label="Calculating your recommendations…"
          detail={
            state.recommendationProgress === null
              ? "Gathering anime for your shortlist"
              : "Checking matches · the completed shortlist will appear together"
          }
        />
      ) : !hasTaste && !picks.length ? (
        <div className="empty">
          <h2>Let’s learn what you enjoy first</h2>
          <p>
            React to anime in Discover, or connect your MAL list in Settings.
            Your choices will shape this shortlist.
          </p>
          <button className="primary" onClick={onDiscover}>
            Explore anime
          </button>
        </div>
      ) : (
        <>
          {state.recommendationsLoading && (
            <LoadingIndicator
              compact
              progress={state.recommendationProgress}
              label="Finishing your shortlist…"
              detail="Your previous picks stay visible until the replacement batch is ready."
            />
          )}
          {state.recommendationError && (
            <p role="alert">{state.recommendationError}</p>
          )}
          {state.recommendationsReady &&
            !picks.length &&
            !state.recommendationError && (
              <div className="empty">
                <h2>No suitable picks yet</h2>
                <p>
                  Go back to Discover to give us more likes and dislikes, then
                  refresh your picks. If you already have plenty of reactions,
                  try broadening your viewing filters.
                </p>
                <button className="primary" onClick={onDiscover}>
                  Back to Discover
                </button>
              </div>
            )}
          {state.busy && !state.watchlistSaving && (
            <LoadingIndicator
              compact
              label={pendingWorkLabel(state)}
              detail="Your loaded picks will stay in place."
            />
          )}
          <div
            className="recommendations-stack"
            aria-label="Ranked anime recommendations"
          >
            {picks.map((pick, index) => {
              const rank = index + 1;
              const expanded = openedId === pick.anime.id;
              const panelId = `recommendation-panel-${pick.anime.id}`;
              const headingId = `recommendation-heading-${pick.anime.id}`;
              const medal = ["Gold", "Silver", "Bronze"][index];
              return (
                <RecommendationExposure
                  animeId={pick.anime.id}
                  surface="recommendations"
                  position={rank}
                  onSeen={store.recordRecommendationExposure}
                  key={pick.anime.id}
                  className={`leaderboard-row ${medal ? `medal-${rank}` : ""}`}
                >
                  <h2 className="leaderboard-heading">
                    <button
                      id={headingId}
                      className="leaderboard-toggle"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onPointerEnter={() =>
                        preparePreview(pick.anime).catch(() => {})
                      }
                      onFocus={() => preparePreview(pick.anime).catch(() => {})}
                      onClick={() => {
                        setOpened(expanded ? null : pick.anime.id);
                        setAbout(null);
                      }}
                    >
                      <span
                        className="leaderboard-number"
                        aria-label={`${medal ? medal + ", " : ""}Rank ${rank}`}
                      >
                        {rank}
                      </span>
                      {pick.anime.image && (
                        <img
                          className="leaderboard-cover"
                          src={coverUrl(pick.anime)}
                          alt=""
                          width="32"
                          height="44"
                          loading={index > 4 ? "lazy" : "eager"}
                        />
                      )}
                      <span className="leaderboard-title">
                        <AnimeTitle anime={pick.anime} />
                      </span>
                      <span className="leaderboard-facts">
                        {[
                          pick.anime.year,
                          pick.anime.format?.replaceAll("_", " ").toUpperCase(),
                          pick.anime.episodes
                            ? `${pick.anime.episodes} ${pick.anime.episodes === 1 ? "episode" : "episodes"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <Icon name="chevron" />
                    </button>
                  </h2>
                  <div
                    id={panelId}
                    hidden={!expanded}
                    role="region"
                    aria-labelledby={headingId}
                  >
                    {expanded && (
                      <>
                        <AnimeCard
                          anime={pick.anime}
                          selectedGenres={
                            (
                              state.recommendationPreferences ||
                              state.preferences
                            ).favoriteGenres
                          }
                          restrictGenres={
                            (
                              state.recommendationPreferences ||
                              state.preferences
                            ).restrictGenres
                          }
                          selectedThemes={
                            (
                              state.recommendationPreferences ||
                              state.preferences
                            ).requiredThemes
                          }
                          selectedNodes={
                            (
                              state.recommendationPreferences ||
                              state.preferences
                            ).preferredNodes
                          }
                          restrictNodes={
                            (
                              state.recommendationPreferences ||
                              state.preferences
                            ).restrictNodes
                          }
                          selectedCategories={
                            (
                              state.recommendationPreferences ||
                              state.preferences
                            ).requiredCategories
                          }
                          onPreferences={onPreferences}
                          reason={pick.reason}
                          compact
                          showGenreFocus={false}
                          dynamic={state.settings?.dynamic !== false}
                          busy={state.busy || state.recommendationsLoading}
                          detailsOpen={
                            about === pick.anime.id ? detailsTab : false
                          }
                          onDetails={() => {
                            setDetailsTab("synopsis");
                            setAbout(pick.anime.id);
                          }}
                          onWhy={() => {
                            setDetailsTab("why");
                            setAbout(pick.anime.id);
                          }}
                          onReact={(action) => {
                            setLastChoice({
                              id: pick.anime.id,
                              title: pick.anime.title,
                            });
                            store.react(action, pick.anime);
                          }}
                        />
                        {about === pick.anime.id && (
                          <AnimeDetails
                            modal
                            initialTab={detailsTab}
                            reactions={state.reactions}
                            onSaveFeedback={store.setReactionFeedback}
                            anime={pick.anime}
                            reason={pick.detailReason || pick.reason}
                            reasons={pick.whyReasons}
                            onClose={() => setAbout(null)}
                          />
                        )}
                      </>
                    )}
                  </div>
                </RecommendationExposure>
              );
            })}
          </div>
          {state.recommendationsReady && picks.length < 25 && (
            <p className="shortlist-note">
              {picks.length} eligible {picks.length === 1 ? "match" : "matches"}{" "}
              available.{" "}
              {state.preview
                ? "The demo contains only seven sample anime."
                : "React to more anime in Discover to help us learn your taste, then refresh picks. You can also broaden your viewing preferences."}{" "}
              Refresh picks to find more eligible matches.
              <button className="quiet" onClick={onDiscover}>
                Explore more in Discover
              </button>
            </p>
          )}
        </>
      )}
    </section>
  );
}
