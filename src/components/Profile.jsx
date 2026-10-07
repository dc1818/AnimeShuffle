import { useMemo, useState } from "react";
import { profileTaste } from "../lib/profile-taste.js";
import { coverUrl } from "./AnimeCard.jsx";
import { AnimeTitle } from "./AnimeTitle.jsx";

function Covers({ entries, limit = 3 }) {
  return (
    <div className="profile-covers">
      {entries.slice(0, limit).map(({ anime, evidence }) => (
        <a
          key={anime.id}
          href={`https://myanimelist.net/anime/${anime.id}`}
          target="_blank"
          rel="noreferrer"
          title={`${anime.title} · ${evidence}`}
        >
          <img src={coverUrl(anime)} alt="" loading="lazy" />
          <span>
            <AnimeTitle anime={anime} />
          </span>
          <small>{evidence}</small>
        </a>
      ))}
    </div>
  );
}
function TasteCard({ group, bucket = "liked" }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article
      className={`profile-taste-card ${bucket === "curious" ? "curious" : ""}`}
    >
      <button
        className="profile-card-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <h3>{group.label}</h3>
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      <p className="profile-caption">
        {group[bucket].length}{" "}
        {bucket === "liked"
          ? "shows you enjoyed"
          : "shows that caught your interest"}
      </p>
      <Covers entries={group[bucket]} limit={expanded ? 12 : 3} />
      {expanded && (
        <p className="profile-caption">
          {bucket === "liked"
            ? "A shared thread in these favorites—not necessarily the reason you liked every one."
            : "Something you may want to explore. These choices aren’t treated as shows you’ve enjoyed."}
        </p>
      )}
    </article>
  );
}
function Constellation({ taste }) {
  const [selected, setSelected] = useState(null);
  const current =
    taste.interests.find((g) => g.key === selected) || taste.interests[0];
  const points = taste.interests.map((_, i) => ({
    x:
      50 +
      34 * Math.cos((i * 2 * Math.PI) / taste.interests.length - Math.PI / 2),
    y:
      50 +
      34 * Math.sin((i * 2 * Math.PI) / taste.interests.length - Math.PI / 2),
  }));
  return (
    <section className="taste-explorer" aria-label="Taste constellation">
      <div className="taste-map">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {taste.edges.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={points[a].x}
              y1={points[a].y}
              x2={points[b].x}
              y2={points[b].y}
            />
          ))}
        </svg>
        {taste.interests.map((g, i) => (
          <button
            key={g.key}
            className="taste-node"
            style={{ left: `${points[i].x}%`, top: `${points[i].y}%` }}
            aria-pressed={current?.key === g.key}
            onClick={() => setSelected(g.key)}
          >
            {g.shortLabel}
          </button>
        ))}
      </div>
      {current && (
        <div className="taste-evidence">
          <h3>{current.label}</h3>
          <p className="profile-caption">
            From shows you enjoyed. Lines connect interests that share an anime.
          </p>
          <Covers entries={current.liked} />
        </div>
      )}
    </section>
  );
}
export function Profile({ state, onDiscover }) {
  const taste = useMemo(
    () => profileTaste(state),
    [state.reactions, state.list, state.preferences, state.recommendationPool],
  );
  const [exploring, setExploring] = useState(false);
  const account = state.session.account;
  const name = account?.name || state.profile?.name || "Your profile";
  const malName =
    state.profile?.name || (account?.provider === "mal" ? name : null);
  return (
    <section className="profile-page" aria-label="Your profile">
      <header className="profile-header">
        <div className="profile-avatar" aria-hidden="true">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="profile-eyebrow">YOUR PROFILE</p>
          <h1>{name}</h1>
          <div className="profile-meta">
            <span>
              {account?.provider === "mal"
                ? "MyAnimeList account"
                : "Anime Shuffle account"}
            </span>
            {malName && (
              <a
                href={`https://myanimelist.net/profile/${encodeURIComponent(malName)}`}
                target="_blank"
                rel="noreferrer"
              >
                MyAnimeList profile ↗
              </a>
            )}
          </div>
        </div>
      </header>
      <div className="profile-section-heading">
        <div>
          <h2>The different sides of your taste</h2>
          <p>Shared threads in the stories you enjoy.</p>
        </div>
        {taste.interests.length > 0 && (
          <button
            className="quiet"
            aria-expanded={exploring}
            onClick={() => setExploring(!exploring)}
          >
            {exploring ? "Back to taste cards" : "Explore your taste"}
          </button>
        )}
      </div>
      {!state.accountDataReady ? (
        <p role="status">Loading your profile…</p>
      ) : taste.interests.length ? (
        exploring ? (
          <Constellation taste={taste} />
        ) : (
          <div className="profile-taste-grid">
            {taste.interests.slice(0, 6).map((g) => (
              <TasteCard key={g.key} group={g} />
            ))}
          </div>
        )
      ) : (
        <div className="profile-empty">
          <h3>Your taste is still taking shape</h3>
          <p>
            Mark shows you’ve enjoyed as Good in Discover. Shared themes will
            appear here as we find enough evidence.
          </p>
          <button className="primary" onClick={onDiscover}>
            Go to Discover
          </button>
        </div>
      )}
      {state.accountDataReady && taste.curious.length > 0 && (
        <section>
          <h2>Curious about</h2>
          <p className="profile-caption">
            Interests you’re exploring through Would Watch and your MAL list.
          </p>
          <div className="profile-taste-grid">
            {taste.curious.map((g) => (
              <TasteCard key={g.key} group={g} bucket="curious" />
            ))}
          </div>
        </section>
      )}
      {state.accountDataReady && taste.contrasts.length > 0 && (
        <section>
          <h2>It depends on the show</h2>
          <p className="profile-caption">
            The same theme can land differently. These choices don’t point to a
            simple like or dislike.
          </p>
          {taste.contrasts.map((g) => (
            <article className="profile-contrast" key={g.key}>
              <h3>{g.label}</h3>
              <div>
                <section>
                  <h4>Enjoyed</h4>
                  <Covers entries={g.liked} />
                </section>
                <section>
                  <h4>Didn’t enjoy</h4>
                  <Covers entries={g.disliked} />
                </section>
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
