# Anime Shuffle interface

Preserve the existing dark navy surfaces, blue actions, anime artwork and cover-derived Aurora backgrounds. Aurora, Liquid light and Comet drift are intentional brand exceptions to generic no-gradient guidance. Respect the animation/off preference, reduced motion and software-rendering fallback.

Discover centers on one title and four reactions. Good/Bad means seen; Would/Won’t watch means prospective interest. Explanations and optional feedback identify the specific title. Recommendations remain stable until refresh; reacting must retain the row and Undo.

Navigation uses real hash links for Discover, Watchlist and Recommendations. Hash routing supports both the Worker and GitHub Pages deployments. Reload and browser history restore the page; authentication query cleanup preserves the route.

Onboarding offers an immediate Start shuffling action with current safe defaults. Favorite titles and format are optional; genres, audience and advanced restrictions live under More preferences. Keep the start action visible during scrolling. Returning users retain automatic preference saving.

On phones (640px and narrower), Watchlist keeps search and sorting visible, with other filters under a toggle that indicates active filters. Import/export has a separate disclosure. Closing a disclosure must not reset selections. Desktop keeps filters exposed.

Use native dialogs with headings as accessible names, Escape/backdrop behavior appropriate to the flow, and visible keyboard focus. Close controls have at least 44px hit areas. Preserve browser zoom, scrolling, long-title wrapping and safe areas; never hide essential content merely to fit a viewport.

Validation: React interaction tests cover onboarding, navigation/history, disclosures and retained state. Existing component fixtures exercise phone, tablet, desktop and short viewports without changing a user profile. Source review and browser rendering are separate checks; fixtures do not establish production API speed or real cross-device synchronization.

Workflow references: the user’s web-design-workflow skill, Taste app-screen guidance and Vercel Web Interface Guidelines. Keep these subordinate to the product’s established design and behavior.
