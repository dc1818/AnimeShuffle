# Anime Shuffle interface

Preserve the existing dark navy surfaces, blue actions, anime artwork and cover-derived Aurora backgrounds. Aurora, Liquid light and Comet drift are intentional brand exceptions to generic no-gradient guidance. Respect the animation/off preference, reduced motion and software-rendering fallback.

Discover centers on one title and four reactions. Good/Bad means seen; Would/Won’t watch means prospective interest. Explanations and optional feedback identify the specific title. Recommendations remain stable until refresh; reacting must retain the row and Undo.

Navigation uses real hash links for Discover, Watchlist and Recommendations. Hash routing supports both the Worker and GitHub Pages deployments. Reload and browser history restore the page; authentication query cleanup preserves the route.

Onboarding offers an immediate Start shuffling action with current safe defaults. Favorite titles and format are optional; genres, audience and advanced restrictions live under More preferences. Keep the start action visible during scrolling. Returning users retain automatic preference saving.

On phones (640px and narrower), Watchlist keeps search and sorting visible, with other filters under a toggle that indicates active filters. Import/export has a separate disclosure. Closing a disclosure must not reset selections. Desktop keeps filters exposed.

Use native dialogs with headings as accessible names, Escape/backdrop behavior appropriate to the flow, and visible keyboard focus. Close controls have at least 44px hit areas. Preserve browser zoom, scrolling, long-title wrapping and safe areas; never hide essential content merely to fit a viewport.

Validation: React interaction tests cover onboarding, navigation/history, disclosures and retained state. Existing component fixtures exercise phone, tablet, desktop and short viewports without changing a user profile. Source review and browser rendering are separate checks; fixtures do not establish production API speed or real cross-device synchronization.

Discover's More details and Why this pick controls share a subtle outlined surface with a persistent vertical separator, independent hover/focus states and at least 44px targets. Decorative background motion pauses behind open native dialogs as well as in hidden tabs; keep the anime palette visible. Aurora SVG groups use an explicit transform box. Animate transforms and opacity rather than layout or background paint properties.

Workflow references: the user’s web-design-workflow skill, Taste app-screen guidance and Vercel Web Interface Guidelines. Keep these subordinate to the product’s established design and behavior.

Discover refinement (October 2026): use a single navy surface up to 1120px wide, with contained artwork (scale down smaller originals; never stretch them) and information in two columns above 900px. The title leads (28–40px desktop, 26–28px narrow); facts use 13–14px, synopsis 14–15px. Keep category facet labels in sentence case, Audience explicit even when unknown, and deeper taxonomy paths expandable. Details and Why this pick are secondary 44px controls; the latter opens the existing explanation tab directly. Discover details and Why this pick open in a centered native dialog at every width, without scrolling or resizing the page behind them. Keep the close control and tabs visible, scroll the dialog body internally, and restore focus to the opener. Backdrop clicks and Escape close it. Gallery and feedback remain inside the same flow.

Phones use contained cover art, compact facts, and two labeled reaction rows; buttons remain at least 44px high. Preserve synopsis expansion, complete titles, browser zoom and natural page scrolling when content exceeds the viewport. Do not force a height with hidden overflow. Reaction meanings/colors, keyboard shortcuts, preview playback, preference restrictions, account sync and recommendation ranking remain unchanged. Keep the actual catalog artwork rather than rasterizing the generated concept into the UI. The concept's simplified header is illustrative: retain working site navigation and account controls.
