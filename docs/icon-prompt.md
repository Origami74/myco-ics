# myco-ics — logo / icon generation prompts

The placeholder icon in `public/` is a code-generated red warning triangle. To
replace it with a designed mark, feed one of these to an image generator
(Midjourney, DALL·E 3, Ideogram, SDXL). Palette matches the app:

- alert red `#E02424` · slate `#0F141B` · off-white `#F4F7FB` · signal blue `#4F9DFF`

## App icon (square, no text)

> A modern flat-vector mobile **app icon** for an emergency incident-command
> app. A rounded-square tile in deep slate (#0F141B). Centered emblem: a bold
> **warning triangle** in alert red (#E02424) that doubles as the apex of a small
> **network/mesh graph** — a few clean nodes and links branching downward from
> the triangle like a chain of command. Crisp geometric line-work, high contrast,
> subtle depth, no gradients-heavy noise. Off-white (#F4F7FB) accents, one signal-
> blue (#4F9DFF) node. Minimal, authoritative, legible at 48px. Centered
> composition, generous padding, flat design, vector, solid background. No text,
> no letters, no photorealism, no drop shadows on the tile edges.

## Wordmark / horizontal logo (with text)

> A horizontal **logo** for "myco·ics", an offline incident-command tool. Left: a
> compact emblem combining a red warning triangle with a downward-branching mesh
> chain-of-command graph. Right: the wordmark "myco·ics" in a clean geometric
> sans-serif, off-white on a dark slate background, "ics" slightly heavier weight.
> Serious, technical, dispatch-console aesthetic. Flat vector, two-color plus one
> blue accent node, transparent background, balanced spacing.

## Notes for iterating

- Emphasize **"chain of command" as a small node graph** to distinguish it from a
  generic hazard sign — the mesh/hierarchy is the whole idea.
- Keep it readable as a 1-bit silhouette (it renders tiny in the mesh Library and
  on a home screen).
- Once you have a square PNG, drop it in `public/` and regenerate the sizes:
  `favicon.ico` (64), `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`.
