const checks = [
  [
    "Your reactions",
    "Good and Bad teach enjoyment. Would Watch and Won’t Watch teach interest. An optional reason focuses learning on that part of the show; one dislike is not a ban on every shared genre.",
  ],
  [
    "Your MyAnimeList history",
    "Personal ratings, list status and favorites provide different strengths of evidence. Interest in watching is kept separate from confirmed enjoyment. A completed show without a rating is not a strong endorsement.",
  ],
  [
    "Genres and premise",
    "Genres, synopsis words and specific story attributes describe what a show is about. Broad labels are only part of the match; Mecha has a reduced broad-genre weight.",
  ],
  [
    "Nuanced research traits",
    "Validated traits can distinguish central from incidental mechs, romance progression, character appeal, powers, tone and presentation. Confidence and evidence affect their strength. Missing information adds no negative evidence.",
  ],
  [
    "Combinations",
    "The model can learn some combinations of review traits and story context, rather than assuming a preference applies to every show. It cannot yet interpret every possible abstract preference from free-form prose.",
  ],
  [
    "Nearby examples",
    "Shows sharing multiple nuanced attributes with positive or negative examples provide a separate similarity signal. This helps preserve different interests, such as thrillers and relaxing comedies.",
  ],
  [
    "Format, length and studio",
    "These supply smaller learned signals alongside content. Length uses episode count multiplied by episode duration. They can also be subject to the user’s explicit filters.",
  ],
  [
    "Community patterns",
    "When available, a small aggregate signal uses correlations between titles with at least five supporting records. It does not use IP address or location as taste evidence.",
  ],
  [
    "Seasons and parts",
    "Each MAL ID keeps its own reactions. Known franchise relationships can add a continuation signal, but liking one part does not mark another part as watched or liked.",
  ],
];

export function AlgorithmGuide() {
  return (
    <section className="admin-panel" aria-labelledby="algorithm-guide">
      <h2 id="algorithm-guide">How an anime becomes a suggestion</h2>
      <p>
        An anime profile describes the show. A user’s taste profile describes
        their preferences. The recommender compares the two; the language model
        enriches anime information in the background, rather than choosing every
        live recommendation.
      </p>
      <h3>1. Check whether the anime is eligible</h3>
      <p>
        Before ranking, Discover excludes titles already reacted to, favorites,
        titles on the connected MAL list, and active skips. A skip hides that
        exact title for seven days without teaching a dislike. Known
        prerequisite seasons must have been seen.
      </p>
      <p>
        It also checks selected genres (any selected genre can match), formats,
        episode-count options, community score range, finished-only preference
        and the setting for unknown metadata. Adult content, children’s titles
        and non-canon movies have separate eligibility rules. Children’s titles
        need both opt-in and evidence of interest. These are eligibility checks,
        not evidence that someone will enjoy a show.
      </p>
      <h3>2. Compare the eligible anime with that user’s evidence</h3>
      <div className="admin-table-scroll">
        <table>
          <thead>
            <tr>
              <th>What it checks</th>
              <th>What that means</th>
            </tr>
          </thead>
          <tbody>
            {checks.map(([name, explanation]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>3. Combine scores and keep some variety</h3>
      <p>
        The base match combines 80% learned content matching and 20% similarity
        to nearby examples, then adds the continuation signal. Within content
        matching, enjoyment contributes 65% and watch interest 35%. These are
        ranking scores, not a percentage chance that someone will like the
        anime.
      </p>
      <p>
        Discover reserves some choices for exploration (20% after the initial
        learning stage). Shortlists also reduce repetition between similar
        candidates. The next card therefore need not be the highest raw score. A
        larger number of research tags or explanation bullets does not
        automatically mean a better match.
      </p>
      <h3>4. Explain the useful connections without spoilers</h3>
      <p>
        “Why this pick?” should connect safe, supported attributes to that
        user’s positive evidence. Private research prose and spoiler details
        stay out of public explanations. Having no filler can be useful factual
        information, but is not a reason to claim that two shows suit the same
        person. Reasons should not be invented to fill a bullet quota.
      </p>
      <details>
        <summary>
          How uploaded research affects matching—and what it cannot do yet
        </summary>
        <p>
          Import validation checks the supported vocabulary, evidence
          references, confidence and versions. Accepted controlled traits feed
          the same feature system used by the recommender. Re-uploading a MAL ID
          merges research; omitted or unknown fields do not erase existing
          findings.
        </p>
        <p>
          The catalog supports 2,588 traits, including 2,400 detailed additions
          in 120 families. Availability does not mean an anime has been
          assessed. The admin trait matrix separates presence, absence,
          uncertainty and missing research. Related tags are not automatically
          copied.
        </p>
        <p>
          Matching traits need at least 45% confidence, 30% presence and a known
          role. Central traits count more than incidental ones. Expanded
          families share a weight budget so twenty similar tags cannot count
          like twenty unrelated interests. Private outcomes and advisory traits
          are stored but excluded from the current browser recommender and
          public payloads. Each new finding also needs a spoiler-safety review:
          even an ordinary trait can reveal a specific show's secret. Without an
          explicit safe assignment it stays private. Clearing a saved spoiler
          warning requires an intentional superseding revision.
        </p>
        <p>
          Cloudflare considers the original vocabulary plus at most 48 relevant
          new traits per analysis. Owner research questions can prioritize a
          specific trait key. Text overlap only selects questions; cited
          evidence is still required before any finding is stored. This is not
          an exhaustive assessment of every trait on every model call.
        </p>
        <p>
          Long descriptions, reusable dimensions and source notes preserve
          context for future analysis. They do not automatically become ranking
          features. A new kind of taste needs a supported trait mapping and
          scoring integration before it can change suggestions. Merely adding a
          research question does not add that integration.
        </p>
        <p>
          Independent agreement is more useful than repeated copies of one
          source. Unknown, unresearched, insufficient-evidence and disputed
          findings must remain distinguishable. A successful upload proves
          compatibility, not factual accuracy or improved recommendations.
        </p>
      </details>
      <h3>How to check whether enrichment helped</h3>
      <ol>
        <li>
          Open Anime research and inspect the import preview’s matching impact.
          New usable traits differ from repeated metadata, changed weights and
          notes-only research.
        </li>
        <li>
          After importing, inspect the stored profile and its missing research
          areas. A saved profile can still be preliminary or add no matching
          information.
        </li>
        <li>
          In Accounts & tastes, select an account and use Inspect a
          recommendation with the candidate’s MAL ID. Check the filters and
          feature contributions against that person’s actual choices.
        </li>
        <li>
          Use held-out user reactions to evaluate changes. Aggregate counts
          below describe usage; they do not prove that enrichment improved
          recommendation quality.
        </li>
      </ol>
    </section>
  );
}
