# Original Anime Shuffle backgrounds

Generated with the built-in image-generation tool for this project on 2026-10-23. These are original generated scenes, not screenshots or licensed footage from an anime. No external image host is required.

Production assets: `sakura-painted.webp`, `skyline-painted.webp`, `mountains-painted.webp`. Picker thumbnails: corresponding `*-preview.webp`. WebP encoding and thumbnail sizing are the only post-generation operations. Each painting is 1672 × 941; thumbnails fit 480 × 270.

Prompt set / art direction:
- **Lantern town**: original hand-painted anime environment, quiet Japanese hillside town at blue hour, layered tiled rooftops, lantern-lit lanes and telephone poles on the outer thirds, distant mountains, navy twilight and amber windows, fine background-painting detail and natural brushwork, calm center for UI and phone cropping. No people, text, logos, UI, flat vector or glossy 3D.
- **Sakura riverside**: original hand-painted anime background, cherry trees arching from the edges, delicate pink blossoms, calm river, footbridge and distant lanterns, stone embankment, layered homes, gouache texture and fine drawn detail, lavender dusk and blue shadows, calm center for UI and phone cropping. No people, text, logos, UI, flat vector, 3D or neon.
- **Mountain sanctuary**: original hand-painted anime mountain valley before dawn, pine silhouettes framing edges, layered blue mist, secluded wooden shrine and warm lantern near stone steps at lower right, quiet misty center and pale moon, gouache and fine foliage, muted teal/navy and ivory. No people, text, logos, UI, simplistic geometry or 3D.

A bounded WebGL renderer animates masked regions of the original paintings; these are not frame-animated video assets. Color matching tints the image using the current anime's palette. Motion-off preserves the painting. Style keys remain compatible with saved preferences from the earlier SVG scenes.

Additional original built-in imagegen artwork (2026-10-23):
- **Orbital frontier** (`orbit-painted.webp`, `orbit-preview.webp`): hand-painted anime space-opera environment viewed from a deserted orbital platform, immense luminous planet, ringed moon, distant cruiser, industrial docking silhouettes, fine mechanical detail, gouache texture, navy/turquoise with amber lights; quiet UI center, phone-compatible crop, no people/text/logos or recognizable franchise designs.
- **Skybound ruins** (`skyislands-painted.webp`, `skyislands-preview.webp`): hand-painted anime fantasy archipelago of floating mossy islands above clouds, cascading waterfalls, ruined stone towers and bridges, windblown greenery and distant airship; indigo/peach twilight, detailed gouache painting, quiet center for UI and phone crop; no Japanese village/shrine, people/text/logos or recognizable franchise designs.

Illustrated scenes use a fixed camera. PaintedSceneMotion animates river/lake ripples, blossom clusters, waterfalls, existing cloud regions and existing lantern/engine light. Architecture, island edges, ships and framing stay stationary. No floating particle overlays. Region coordinates use original image space and the same cover crop as the static image on phones and desktop. The renderer caps resolution at 1600px and draws at 24fps, pauses for hidden tabs/open dialogs, and falls back to the painting for reduced motion, disabled animation, missing hardware support, shader/context failure or sustained slow frames.
