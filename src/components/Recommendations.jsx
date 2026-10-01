import { useEffect, useRef, useState } from "react";
import { AnimeCard, AnimeDetails } from "./AnimeCard.jsx";
import { buildTaste, rankRecommendations } from "../lib/recommend.js";

/** Seven positions in a single scrollable row; reactions use the same commands as Discover. */
export function Recommendations({ state, store, onDiscover }) {
  const requested = useRef(false);
  const [opened, setOpened] = useState(null);
  useEffect(() => {
    if (
      !requested.current &&
      state.ready &&
      state.onboardingComplete &&
      !state.busy
    ) {
      requested.current = true;
      store.loadRecommendations();
    }
  }, [state.ready, state.onboardingComplete, state.busy, store]);
  const taste = buildTaste(state.reactions, state.list);
  const hasTaste = [...taste.records.values()].some((r) => r.weight !== 0);
  const picks = hasTaste
    ? rankRecommendations(state.recommendationPool, state)
    : [];
  const detail = picks.find((p) => p.anime.id === opened);
  return (
    <section
      className="recommendations-page"
      aria-labelledby="recommendations-title"
    >
      <div className="recommendations-heading">
        <div>
          <span className="eyebrow">Based on your taste</span>
          <h1 id="recommendations-title">Your top seven</h1>
          <p>
            Strongest match first. Tier 1 is your best match among these picks,
            not an overall anime rating.
          </p>
          <p>
            Learned from your reactions and, when connected, your MAL list.
            Scores on MAL are optional.
          </p>
        </div>
        <div>
          <button
            className="outline"
            disabled={state.busy || !hasTaste}
            onClick={() => {
              setOpened(null);
              store.loadRecommendations();
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
      {!hasTaste ? (
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
          {state.busy && (
            <p role="status">
              Checking anime details and calculating your matches…
            </p>
          )}
          {state.recommendationError && (
            <p role="alert">{state.recommendationError}</p>
          )}
          <div
            className="recommendations-row"
            aria-label="Anime ranked from tier 1 to tier 7"
            tabIndex={0}
          >
            {picks.map((pick) => (
              <AnimeCard
                key={pick.anime.id}
                {...pick}
                compact
                busy={state.busy}
                detailsOpen={opened === pick.anime.id}
                onDetails={() =>
                  setOpened(opened === pick.anime.id ? null : pick.anime.id)
                }
                onReact={(action) => store.react(action, pick.anime)}
              />
            ))}
          </div>
          {!state.busy && state.recommendationsReady && picks.length < 7 && (
            <p className="shortlist-note">
              {picks.length} eligible {picks.length === 1 ? "match" : "matches"}{" "}
              available.{" "}
              {state.preview
                ? "The demo contains only seven sample anime."
                : "Refresh picks to check more candidates, or broaden your viewing preferences."}{" "}
              Seen and rejected shows are excluded.
            </p>
          )}
          {detail && (
            <div className="recommendation-details">
              <AnimeDetails
                anime={detail.anime}
                reason={detail.reason}
                onClose={() => setOpened(null)}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
