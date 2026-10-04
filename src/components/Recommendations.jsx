import { AnimeTitle } from "./AnimeTitle.jsx";
import { useEffect, useMemo, useState } from "react";
import { LoadingIndicator, pendingWorkLabel } from "./LoadingIndicator.jsx";
import { Icon } from "./Icon.jsx";
import { AnimeCard, AnimeDetails } from "./AnimeCard.jsx";
import { buildTaste, tasteReadiness } from "../lib/recommend.js";

/** Accordion leaderboard: native buttons support Enter/Space and one expanded row at a time. */
export function Recommendations({ state, store, onDiscover, onPreferences }) {
  const [opened, setOpened] = useState(undefined);
  const [about, setAbout] = useState(null);
  const aboutAvailable = state.recommendationPicks.some(
    (pick) => pick.anime.id === about,
  );
  const aboutReaction = state.reactions[about]?.action;
  useEffect(() => {
    if (!aboutAvailable || aboutReaction) setAbout(null);
  }, [aboutAvailable, aboutReaction]);
  useEffect(() => {
    if (
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
    () => tasteReadiness(state.reactions, state.list, state.preferences),
    [state.reactions, state.list, state.preferences],
  );
  const hasTaste =
    state.preferences.favoriteGenres.length > 0 ||
    [...taste.records.values()].some((r) => r.weight !== 0);
  // Keep this batch and its numbering stable until Refresh picks. Undo re-enables a row.
  const picks = state.recommendationPicks || [];
  // Open the first pick initially; null means the user explicitly collapsed it.
  const openedId = opened === undefined ? picks[0]?.anime.id : opened;
  return (
    <section
      className="recommendations-page"
      aria-labelledby="recommendations-title"
    >
      <div className="recommendations-heading">
        <div>
          <span className="eyebrow">Based on your taste</span>
          <h1 id="recommendations-title">Your top 25</h1>
          <p>
            Ranked for your taste. Click a row to explore. Tier 1 is your
            strongest match.
          </p>
          <p>
            Learned from your favorites, genre choices, reactions and, when
            connected, your MAL list. Scores on MAL are optional. You may see
            fewer than 25 picks while we learn your taste or when eligible
            titles run low. React to more anime in Discover to help shape fresh
            suggestions. A loaded shortlist stays in place until you choose
            Refresh picks, including after changing preferences.
          </p>
        </div>
        <div>
          <button
            className="outline"
            disabled={state.busy || !hasTaste}
            onClick={() => {
              setOpened(undefined);
              setAbout(null);
              store.loadRecommendations({ force: true });
            }}
          >
            Refresh picks
          </button>
          <button
            className="quiet"
            disabled={state.busy || !state.canUndo}
            onClick={store.undo}
          >
            Undo last reaction
          </button>
        </div>
      </div>
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
      {state.recommendationsLoading ||
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
              : "Candidate checks completed · your picks appear when ready"
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
          {state.busy && (
            <LoadingIndicator
              compact
              label={pendingWorkLabel(state)}
              detail="Your loaded picks will stay in place."
            />
          )}
          <div
            className="recommendations-stack"
            aria-label="Anime leaderboard: tiers 1 to 25"
          >
            {picks.map((pick) => {
              const reaction = state.reactions[pick.anime.id]?.action;
              const known =
                state.list.some((a) => a.id === pick.anime.id) ||
                state.preferences.favoriteAnime.some(
                  (a) => a.id === pick.anime.id,
                );
              const reacted = !!reaction || known;
              const feedback =
                {
                  good: "Seen · Liked",
                  bad: "Seen · Disliked",
                  watch: "Saved to Watchlist",
                  nope: "Passed",
                }[reaction] ||
                (known ? "Already on your MAL list or favorites" : "");
              const expanded = openedId === pick.anime.id;
              const panelId = `recommendation-panel-${pick.anime.id}`;
              const headingId = `recommendation-heading-${pick.anime.id}`;
              const medal = ["Gold", "Silver", "Bronze"][pick.tier - 1];
              return (
                <div
                  key={pick.anime.id}
                  className={`leaderboard-row ${reacted ? "reacted" : ""} ${medal ? `medal-${pick.tier}` : ""}`}
                >
                  <h2 className="leaderboard-heading">
                    <button
                      id={headingId}
                      className="leaderboard-toggle"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => {
                        setOpened(expanded ? null : pick.anime.id);
                        setAbout(null);
                      }}
                    >
                      <span
                        className="leaderboard-number"
                        aria-label={`${medal ? medal + ", " : ""}Tier ${pick.tier}`}
                      >
                        {pick.tier}
                      </span>
                      <span className="leaderboard-title">
                        <AnimeTitle anime={pick.anime} />
                      </span>
                      {feedback && (
                        <span className="reaction-feedback">{feedback}</span>
                      )}
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
                          onPreferences={onPreferences}
                          reason={pick.reason}
                          saved={pick.saved}
                          compact
                          busy={state.busy}
                          reactionDisabled={reacted}
                          canUndo={state.undoableIds?.includes(pick.anime.id)}
                          onUndo={() => store.undo(pick.anime.id)}
                          detailsOpen={about === pick.anime.id}
                          onDetails={() =>
                            setAbout(
                              about === pick.anime.id ? null : pick.anime.id,
                            )
                          }
                          onReact={(action) => store.react(action, pick.anime)}
                        />
                        {about === pick.anime.id && (
                          <div className="recommendation-details">
                            <AnimeDetails
                              anime={pick.anime}
                              reason={pick.detailReason || pick.reason}
                              onClose={() => setAbout(null)}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
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
              Saved, seen and rejected shows are excluded from new batches.
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
