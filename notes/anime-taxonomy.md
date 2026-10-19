# Uploaded category graph integration

The site now imports the uploaded 287-node vocabulary. The remaining sections document the earlier catalog-tag filters retained for compatibility.

- Original reconstructed input: `taxonomy/research-source.json` (unchanged).
- Review and reproducible build: `../scripts/build-taxonomy.mjs`.
- Validation counts and original provenance warning: `taxonomy/audit.json`.
- Runtime data: `../src/lib/anime-taxonomy-data.json`.
- Runtime mapping/ancestry: `../src/lib/anime-taxonomy.js`.

The input explicitly identifies itself as a reconstruction, not the original Deep Research exports. It contains 55 populated definitions; blank definitions are not completed by guessing. All 287 nodes are retained. Five deprecated labels are excluded from selection and assignment. The 22 structural nodes organize browsing and are not title traits.

The production graph has 444 links: 229 grouping links, 69 reviewed subtype links, and 146 related links. Six additional subtype routes complete direct navigation (for example Sports to Combat Sports, and Comedy to Romantic Comedy); other original edges are reclassified conservatively. A cycle check covers all links. Related links and grouping links never cause automatic title assignment. Subtype links are editorial application rules, not claims that the original sources published this exact ontology.

Known catalog genres/themes/demographics map by exact normalized labels or explicit aliases. Provider adaptation source and release format are separate inputs. No synopsis keyword classification, report-example assignment, new scraping, or LLM call is introduced. The MAL adapter does not add an unsupported `source` field request; the existing Jikan-compatible candidate response supplies source when available. Coverage of deep nodes depends on structured tags actually present. This update does not populate every node for every anime or introduce an external fine-grained tag provider.

Preferences persist `preferredNodes` and `restrictNodes` using the shared client/server normalizer. Selections are soft interests by default. Hard filtering requires any selected node (including verified subtype descendants) AND the existing other restrictions; unknown tags cannot satisfy a hard filter. A broad tag never implies a narrow child. Changing node restrictions invalidates the current catalog filter key without forwarding unsupported provider filters.

The learner adds bounded category features and lower-strength inherited ancestry, deduplicates paths, and avoids a duplicate direct signal for existing broad genre/theme features. Source-tag audience/genre interactions remain bounded. Ratings and watch interest retain separate heads. Community signals, reaction-reason attribution, AI fallback and randomized sampling remain in place. Spoiler-safe category explanations use actual positive model contributions.

The graph is bundled with the static application; memberships and ancestor closure are cached in memory. No D1 table, per-pick SQL traversal, extra evidence request, or AI token spend is required for this feature. Existing account saves still use their ordinary storage path. The settings browser renders one branch or a bounded search result page. Card category paths are collapsed by default, and shared card rendering applies to Discover and Recommendations.

Verification: graph integrity, false-parent regressions, unknown handling, preference/eligibility integration, learned ranking, bounded weights, repeatable random discovery, and DOM interaction tests. Browser layout screenshots were unavailable in this environment; generated mockups illustrate the intended responsive design rather than serving as screenshot-based verification.

---

# Anime classification and taste filters

Updated 2026-10-18. These filters use existing catalog metadata, with no LLM calls or extra per-title research.

## Research and interpretation

Jikan exposes genres, explicit genres, themes and demographics separately: https://github.com/jikan-me/jikan-rest/blob/master/app/Anime.php . Publishing audience categories also span many story genres; they do not restrict who may enjoy a work: https://www.publishersweekly.com/pw/print/20250428/97636-girls-to-the-front-of-manga-readership.html .

The website presents demographics as Audience, then Genres, then Themes. This is a navigation structure, not an assertion that genres belong exclusively to one demographic. Related themes and thematic browsing groups below are editorial navigation suggestions, not official parent-child relationships. Only source-provided tags can qualify a title. Missing audience tags are never inferred from its plot, art, maturity rating or character genders.

## Audience categories

- **Shounen:** Traditionally marketed to teenage boys; includes action, comedy, romance, sports and more.

- **Shoujo:** Traditionally marketed to teenage girls; includes romance, fantasy, adventure, drama and more.

- **Seinen:** Traditionally marketed to adult men; ranges from everyday comedy to drama, mystery and more.

- **Josei:** Traditionally marketed to adult women; includes relationships, everyday life, drama and more.

- **Kids:** Children-oriented titles, also called Kodomo or Kodomomuke. Not a substitute for age ratings.

## Genres and potential refinements

17 story genres. Award Winning remains available as a separate recognition filter for compatibility; it is not a story genre.

- **Action:** Martial Arts, Samurai, Super Power, Military.

- **Adventure:** Isekai, Space, Survival, Historical.

- **Avant Garde:** Psychological.

- **Boys Love:** Adult Cast, School, Workplace.

- **Comedy:** Gag Humor, Parody.

- **Drama:** Adult Cast, Childcare, Medical, Performing Arts.

- **Fantasy:** Isekai, Reincarnation, Mahou Shoujo, Mythology.

- **Girls Love:** Adult Cast, School, Workplace.

- **Gourmet:** Workplace, Iyashikei.

- **Horror:** Gore, Vampire, Survival, Psychological.

- **Mystery:** Detective, Psychological.

- **Romance:** Love Polygon, Romantic Subtext.

- **Sci-Fi:** Mecha, Space, Time Travel.

- **Slice of Life:** Iyashikei, School, Workplace.

- **Sports:** Team Sports, Combat Sports, Racing.

- **Supernatural:** Vampire, Mythology.

- **Suspense:** Detective, Organized Crime, Survival, High Stakes Game.

## Themes and subcategories

51 source-tag options grouped for browsing. A theme can be used with any main category and genre when the anime has those exact tags.

### Action & competition

- **Martial Arts:** Fighting disciplines and techniques.

- **Samurai:** Samurai characters, traditions or conflicts.

- **Military:** Armed forces or military life.

- **Super Power:** Extraordinary abilities.

- **Combat Sports:** Organized competitive fighting sports.

- **Team Sports:** Organized sports played by teams.

- **Racing:** Speed-based competitions.

- **High Stakes Game:** Games or contests with serious consequences.

- **Strategy Game:** Strategic games or structured tactical competition.

### Fantasy & science fiction

- **Isekai:** A character enters or lives in another world.

- **Reincarnation:** Rebirth into another life.

- **Mahou Shoujo:** Magical girls and their transformations or adventures.

- **Mythology:** Myths, legends or folklore.

- **Vampire:** Vampires as a theme.

- **Mecha:** Robots or mechanical vehicles are an identifiable theme.

- **Space:** Outer space settings or travel.

- **Time Travel:** Travel or communication across time.

- **Video Game:** Video games or game worlds.

- **Magical Sex Shift:** A fantastical change of a character’s sex or physical gender presentation.

### Mystery & tension

- **Detective:** Investigators solving cases.

- **Psychological:** Mental states, perception or psychological conflict.

- **Organized Crime:** Criminal organizations and their activities.

- **Survival:** Struggling to survive dangerous conditions.

- **Gore:** Graphic injury or violence; a content consideration.

### Relationships & identity

- **Love Polygon:** Interconnected romantic interests among several characters.

- **Love Status Quo:** Romantic relationships remain largely unresolved or unchanged.

- **Romantic Subtext:** Romantic implications without romance as a main genre.

- **Harem:** Multiple potential female romantic interests around a protagonist.

- **Reverse Harem:** Multiple potential male romantic interests around a protagonist.

- **Crossdressing:** Characters dressing across conventional gender expectations.

### Everyday life & cast

- **Adult Cast:** Primarily adult characters.

- **School:** School life or a school setting.

- **Workplace:** Working life or a professional setting.

- **Childcare:** Raising or caring for children.

- **Pets:** Companion animals and their relationships with people.

- **CGDCT:** Cute girls doing cute things; everyday group activities.

- **Delinquents:** Rebellious youth or delinquent groups.

- **Anthropomorphic:** Human-like animal or nonhuman characters.

- **Iyashikei:** A soothing, restorative atmosphere.

### Arts & entertainment

- **Music:** Music or musicians as a theme.

- **Performing Arts:** Stage performance, acting, dance or related arts.

- **Visual Arts:** Drawing, painting, design or other visual arts.

- **Showbiz:** The entertainment industry.

- **Idols (Female):** Female idol performers and their industry.

- **Idols (Male):** Male idol performers and their industry.

- **Otaku Culture:** Dedicated anime, manga, gaming or related fan culture.

### Comedy styles

- **Gag Humor:** Jokes and comic situations are a defining focus.

- **Parody:** Comic imitation of other works or conventions.

### History & learning

- **Historical:** A historical setting or period.

- **Educational:** Designed to teach topics or skills.

- **Medical:** Medicine, healthcare or medical professionals.

## Filtering and learning

Main categories are optional exact filters. Multiple choices within a level match ANY selected tag. Different active levels combine with AND: Shounen + (Action OR Adventure) + (Military OR Martial Arts). Genre favorites only restrict results when the explicit restriction checkbox is enabled. Themes always restrict when selected. Any main category includes unlabeled titles; choosing categories excludes unlabeled titles. Kids selection also enables children titles; ordinary content settings and known-title exclusions still apply.

Saved reactions already train against catalog tags. Bounded category/genre and category/theme interactions now let the model learn distinctions such as Shounen + Sports versus Shounen + Romance, instead of transferring every broad preference equally. These signals supplement synopsis, feedback, community and semantic evidence; they do not claim that a label explains the user’s entire opinion.

## Remaining data limits

Source coverage varies. An original anime may have no demographic category. Unknown does not mean adult, Shounen, or genre-free. The catalog API taxonomy may evolve; new tags need a reviewed addition to src/lib/genres.js. Existing stored classifications are not fabricated or bulk rewritten.

## Algorithm integration audit and admin analytics — 2026-10-19

- Direct and inherited broad categories share the existing genre feature key. Liking Real Robot can transfer a small positive signal to a Mecha-only title; negative reactions transfer a negative signal. Direct broad tags are counted once. Related graph links never propagate memberships.
- Explicit Kodomo interest plus the children-title opt-in satisfies eligibility and repeat-spacing rules in both Discover and Recommendations.
- Adaptation source and separate theme/demographic metadata survive favorite, account/watchlist, research catalog and guest snapshot serialization. Thin research-catalog updates preserve previously known fields. Old data cannot be reconstructed if it never contained those fields.
- Admin → Algorithm diagnostics → Category coverage & reactions reuses the production graph. Reaction summaries use the existing bounded current-reaction sample, with no additional per-title reads. Catalog coverage is opt-in: `/api/admin/taxonomy?after=<MAL ID>` scans at most 250 titles per page plus one lookahead row using the primary key. Continue until the UI says Complete scan; partial scans are explicitly labeled. No background scans, extra AI calls, writes, or per-title hydration are required.
- Search, missing-coverage filter and JSON export include all active categories, direct versus inherited counts, enjoyment and watch-interest reactions. Release format alone does not qualify a title as content-covered. Missing is unknown, not negative. A reaction may appear under several nodes but only once under each node. These associations are not causal category preferences, impression metrics, or a measured improvement in recommendation accuracy.
- Endpoint remains behind existing owner authentication. Analytics reads stored catalog metadata; this is not complete MAL coverage or a transactionally frozen snapshot. Existing account/candidate simulations still expose actual model feature contributions with their existing sample limits.

## Discover audience and explanations — 2026-10-19

The shared Discover/recommendation card keeps the Audience row visible. Missing catalog demographics display “Not listed”; an age rating, plot or artwork never fills that gap. The tooltip distinguishes audience labels from age restrictions.

Why this pick now describes positively contributing audience/genre combinations, reviewed category interests, shared known categories and strict subtype parents using the same model contributions as ranking. Explicit category choices work before the first reaction; Would Watch remains prospective interest. Parent and child contributions are deduplicated in the prose. Public wording uses an allowlist, so unreviewed plot/trope labels are not exposed. Discover also identifies actual lesser-known-pool draws; this message is absent on ordinary draws and fallback paths. No new evidence fetches, database queries or AI calls are added.
