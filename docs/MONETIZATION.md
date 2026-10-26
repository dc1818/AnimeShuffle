# Anime Shuffle: support and MAL commercial permission

Researched October 26, 2026. This is an implementation and research note, not a representation that MAL has approved this application or a legal compliance audit.

## Donation setup

The footer and Settings footer now link directly, in the same tab, to the owner-provided https://ko-fi.com/dc1818. There is no intermediate support panel or heart icon. The page was reachable with the title “Support dc1818”; payment configuration and transactions have not been tested.

Recommended provider: [Ko-fi](https://ko-fi.com/). Use voluntary one-time tips, without targets, memberships, exclusive content, paid badges, or improved recommendation access. This follows the narrow donation model described in MAL agreement §1(i); commercial authorization is a separate question.

1. Create a Ko-fi creator account with Anime Shuffle branding. Choose an available username; no username or payment account has been created by this change.
2. Connect your own Stripe or PayPal account in Ko-fi's Payment settings and complete the provider's verification yourself. Use USD if that is your payout currency.
3. Select Ko-fi Free / disable Standard (also called Contributor or “Get all of Ko-fi”). New accounts may start with the fee-bearing mode enabled. Ko-fi Free charges 0% platform fee on one-time tips; payment processor fees remain. Buy Me a Coffee generally adds a 5% platform fee plus processing, so Ko-fi is preferable for this simple setup.
4. Configure one-time support. Leave goals, memberships, a shop, commissions, supporter rewards and recurring support disabled for now. This is a conservative implementation choice, not a claim that every recurring contribution is categorically prohibited.
5. Suggested page description: “Anime Shuffle is an independent anime discovery project. Optional tips help with hosting and continued development. Tips do not unlock features or change your recommendations.” A suggested $3 tip is a starting amount, not a fundraising quota; do not add a monthly target.
6. Check the public page while signed out. Verify your recipient/display name, currency, one-time checkout and absence of paid perks. Follow the provider's normal payment-checking guidance; no test payment has been made here.
7. Put your actual public page URL in `SUPPORT_URL` in `src/lib/support.js`. Keep it empty until ownership is verified. Do not use a guessed username or someone else's page. Only public checkout URLs belong here, never API keys or payment credentials.
8. Run `npm run build`, `npm run check`, and `node --test test/support.test.mjs test/settings-panels.test.mjs`; publish using the existing deployment workflow. If updating the separate GitHub Pages demo, also run `npm run build:pages` and include those generated assets.

The checkout is an ordinary external link with `noreferrer` and no-referrer policy. No third-party payment widget, payment API, webhook, card form, supporter identity synchronization, or tracking script is added. The processor may disclose donor transaction details to the creator; the privacy notice explains this. Do not call tips tax-deductible charitable donations.

Sources: [Ko-fi fees](https://help.ko-fi.com/hc/en-us/articles/360002506494-Does-Ko-fi-take-a-fee), [Contributor setting](https://help.ko-fi.com/hc/en-us/articles/25143210488477-Contributor-status), [Buy Me a Coffee fees](https://help.buymeacoffee.com/en/articles/10182730-what-is-buy-me-a-coffee-and-how-does-it-work).

## What MAL actually requires

Primary source: [API License and Developer Agreement](https://myanimelist.net/static/apiagreement.html), fetched directly on October 26, 2026; its displayed last-modified date is August 8, 2019.

- §1(h) defines commercial applications broadly, including paid access, subscriptions, tiers, crowdfunding and quota-based donation solicitation.
- §1(i) includes donations without quotas in its noncommercial examples, with a limited allowance for compliant unobtrusive advertising.
- §3(a)(xiv) requires express written authorization before earning through a commercial application.
- §4(b) requires release/major-change notification and allows review; adding ads and changing to commercial operation are named examples.
- §19(b) directs notices to the Customer Support Form, also linked from §3(a)(xiv).
- §6 does not publish a commercial tariff or guarantee permanently free access. No approval SLA, public approval checklist, or standard commercial rate was found.

Do not interpret an active Client ID, selecting “Commercial” in a registration form, another app's existence, or silence from support as written commercial authorization.

## Where and how to request permission

1. Open [MAL's support page](https://myanimelist.net/about.php?go=support) and choose **Contact Customer Support**. Its observed destination is [the contact route](https://myanimelist.net/support/contact). The fetched form has email, subject, description, inquiry type, device type, and optional attachments/username fields. Choose the closest applicable inquiry category; exact available options can change.
2. Use the email associated with the MAL account that owns Anime Shuffle's API registration. Include the application name and your account username. Ask how they want the existing client registration identified; never send the Client Secret or OAuth tokens.
3. Explain the free app, the proposed paid features and intended prices, and whether ads/affiliate links are planned. Clearly distinguish future proposals from the current voluntary-tip setup.
4. Provide the production URL, privacy/terms links, screenshots, API usage estimates if measured, and a truthful description of data sources, caching, user-data storage and deletion. Do not invent traffic or certify compliance without an audit.
5. Ask for express written approval under §3(a)(xiv), any commercial charges/limits, registration changes, and technical changes they require. Retain the reply with the approved scope before activating paid features.

MAL's public support page routes ordinary API technical questions to the MAL API Club. The agreement specifically directs commercial authorization to the Customer Support Form; label the request as licensing/authorization rather than a coding support question.

## Draft request — review and fill placeholders before sending

Subject: Anime Shuffle — request for written MAL API commercial authorization

Hello MyAnimeList team,

I develop Anime Shuffle, an independent anime-discovery and watchlist website at https://animeshuffle.com. My MAL developer account username is [your username]. It uses MAL authorization/list integration and learns from users' Good, Bad, Would watch and Won't watch reactions to offer personalized recommendations.

I am requesting express written authorization under section 3(a)(xiv) of the API License and Developer Agreement for a future optional paid tier. The proposed additions are saved discovery presets, more detailed taste analysis, and group recommendations. Proposed pricing for your review is $3/month or $25/year; these features/prices are proposals and have not been activated. Core discovery and MAL connection would remain free. No advertising or affiliate program is proposed in this request.

Separately, I am preparing optional one-time Ko-fi tips with no fundraising quotas, paid features, donor ranking advantages or membership rewards. Please confirm that this setup falls within section 1(i), and advise whether any notification or registration update is required.

The current application also uses Tenrai for some MAL-derived public catalog/media/review data, stores account/profile information on its backend, and can use imported research/optional enrichment. I would like guidance on the permissions and changes needed for these existing uses, including sections 3(c), 4(f), and 4(i), rather than assuming a commercial license automatically covers them. I can provide a detailed data-flow and retention summary for review.

Privacy policy: https://animeshuffle.com/privacy.html
Terms: https://animeshuffle.com/terms.html
Source: https://github.com/dc1818/AnimeShuffle
Measured usage and screenshots: [attach current details, or state not yet measured]

Please let me know whether you can authorize this commercial model, what fees or usage limits would apply, how to identify/update my existing client registration, and which changes you require before launch.

Thank you,
[your name]

This request has not been sent. Adjust the proposed paid tier if your intended business model changes.

## Comparable developers: what is and is not verified

- [Kitsune for MyAnimeList](https://alexandremadeira.dev/kitsune/) explicitly states that it uses the official MAL API and offers premium features through a one-time purchase. Its [App Store listing](https://apps.apple.com/us/app/kitsune-for-myanimelist/id6466716447) confirms paid features including scheduling, filtering, personalization and notifications. This is a strong observable commercial example; its private licensing terms and MAL approval correspondence are not public in the sources found.
- [Shukofukurou](https://malupdaterosx.moe/shukofukurou/) describes MAL integration and donor-license feature unlocks. Its developer's [June 2019 API update](https://malupdaterosx.moe/blog/2019/06/21/myanimelist-api-update-3/) describes participation in MAL's closed API beta alongside paid/patron-supported development. This is historical evidence of developer engagement, not proof of today's license price or approval process. Calling a feature purchase a donation does not exempt Anime Shuffle from commercial requirements.
- MyAniList is a different, AniList-backed app. Its monetization cannot establish permission to monetize the MyAnimeList API.

No verifiable public commercial approval letter, guaranteed response time, or standard license price was found. Ask MAL directly rather than estimating a fee from another service's terms.

## Existing data flows to clarify before monetization

This change does not alter discovery, recommendation scoring or data collection. Source inspection found Tenrai requests in `lib/candidate-catalog.mjs`, `lib/trailers.mjs`, `lib/catalog-model.mjs`, `lib/review-enrichment.mjs` and `lib/episode-enrichment.mjs`. MAL §4(i) restricts indirect extraction and directs authorized content retrieval through its API. Ask MAL about these paths and be prepared to replace/remove them if permission is unavailable. Also review existing server-side MAL user-data storage against §3(c)/§4(f), and check commercial rights for imported research and any other provider separately. A tip link does not resolve these pre-existing questions.
