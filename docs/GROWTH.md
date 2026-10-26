# Anime Shuffle: search and audience plan

October 26, 2026. These are recommendations, not traffic or revenue forecasts. No ads have been purchased, community posts sent, or Search Console property verified by this change.

## Implemented foundation

- Support links navigate directly to https://ko-fi.com/dc1818 with no intermediate dialog or heart icon.
- Homepage title/description describe anime recommendations; canonical and social metadata use https://animeshuffle.com/.
- `/how-it-works` is a readable public HTML guide, reachable from the app footer. It explains real behavior and does not depend on login, catalog requests or JavaScript rendering.
- `robots.txt` announces `sitemap.xml`; the sitemap includes the homepage, guide, privacy and terms. API resources needed to render the app are not blocked by robots.txt.
- Policy pages declare their production canonical URLs. Production uses extensionless HTML URLs; links with `.html` also support the static demo and local server.

The app remains a client-rendered application. A sitemap or canonical tag does not guarantee indexing or higher rankings. Public web search did not surface a clear current site result during this review; that is not proof that Google has not indexed it. Direct script requests from this environment received 403 responses, while the live site loaded in the browser. Use Google's own live inspection before attributing this to a Googlebot block.

## First: establish what Google can see

1. In https://search.google.com/search-console add a Domain property for `animeshuffle.com`.
2. Copy the exact DNS TXT verification record Google supplies into the domain's DNS provider, then verify. Do not delete unrelated DNS records.
3. Submit `https://animeshuffle.com/sitemap.xml` in Sitemaps.
4. Inspect the homepage and `/how-it-works`: run Test live URL, inspect the rendered page, check crawl permission and selected canonical, then request indexing once.
5. If inspection reports 403, a challenge, robots blocking or rendering errors, inspect the matching Cloudflare security events and configuration. Do not broadly disable security. Test any narrow correction with Google's live inspection.
6. Weekly, compare Search Console clicks, impressions, queries and indexed pages. Check whether the site is gaining impressions for non-brand searches, not only its name.

Sources: [Domain verification](https://support.google.com/webmasters/answer/9008080), [URL inspection](https://support.google.com/webmasters/answer/9012289), [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview), [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

## Search opportunities

Keep the existing domain. Google says domain keywords alone have hardly any ranking effect; the name can help people remember the product but does not generate an audience by itself.

Prioritize specific user needs: "anime recommendations without ratings", "what anime should I watch next", and "MyAnimeList anime recommendations". These are candidate topics, not measured search-volume or competition estimates. The broader "anime recommendations" query is a longer-term target.

Next useful pages could explain choosing from an oversized Plan to Watch list, choosing a short series by available time, and how to improve picks without numerical scores. Each should solve the stated problem with accurate instructions or a real working preset. Later, add shareable filter/preset URLs so visitors land on the experience promised by a link. Do not publish near-identical keyword pages or copied MAL summaries. An AI draft still needs original value and verification; mass output is not the objective.

Sources: [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [spam policies](https://developers.google.com/search/docs/essentials/spam-policies).

## First 30 days: acquire users without buying traffic

**Week 1:** Complete Search Console setup. Record a 20–30 second screen demo showing favorite anime selection, the four reactions, and saving a recommendation. Lead with the benefit: recommendations without scoring every show. Use your own account/demo data and avoid spoilers. Have a few people try the site on phones and fix friction that prevents reaching a useful pick.

**Week 2:** Publish one honest launch post in an appropriate anime community, disclose that you built it, attach the demo, and ask for specific feedback. r/anime's rules currently allow announcements of released anime tools/websites and require 10 comment karma earned in that community before posting. Check the full current rules; use moderator contact if your post's eligibility is unclear. Do not repost small updates or drop the link into unrelated recommendation threads. Anime Discord communities may have showcase channels; check each server's rules first.

**Week 3:** Publish three short demonstrations on a social account you control: discovering from three favorites, using reactions without scores, and choosing from a watchlist. Put the real site URL in the supported profile/link location. Reuse a recording when sensible, but give each example a specific benefit. Optionally approach a few small anime creators whose audiences already ask for recommendations; this is an outreach task for later, not something sent here.

**Week 4:** Review what worked and fix the largest first-visit problem. Publish one genuinely useful guide answering a question people actually asked. Repeat the strongest channel instead of expanding everywhere.

Source: [r/anime rules](https://www.reddit.com/r/anime/wiki/rules/). Platform rules and eligibility can change.

## Measurement and paid advertising

Existing owner diagnostics do not measure campaign/referrer attribution. Do not claim that adding UTM tags alone makes campaigns measurable. Search Console measures Google search exposure/clicks; existing activity diagnostics can show activity, but a consent/privacy-appropriate campaign funnel would be separate work.

Define activation as a visitor reaching a useful recommendation and saving a title; look at return visits as well as traffic. A sensible first learning target is 100 relevant visitors, not a promised result. Identify why visitors stop before the first save before buying more visits.

For now, use a $0 paid-ad budget. Optional tips are not predictable revenue, so buying clicks before measuring retention and revenue per visitor is speculative. If you later test Google Search or Reddit ads, set a small total loss limit you are comfortable with, instrument activation first, use one narrow campaign and stop when the limit is reached. Do not run broad "anime" ads or assume an ad purchase improves organic search rank.

If an experiment eventually shows average net revenue per acquired visitor of R, acquisition cost must remain below R to be profitable before other costs. No such figure is measured yet. Do not buy backlinks, bot traffic or guaranteed-ranking packages.

Source: [How Google Search works](https://developers.google.com/search/docs/fundamentals/how-search-works).
