# God Brave Hero Visual Standard v1

## Purpose

The six base heroes use one original, programmatic Pixel Chibi system. The renderer is intentionally separate from combat truth: events from `src/core.js` select presentation states, while the visual module never changes damage, targeting, cooldowns, RNG, formation, or save data.

## Shared sprite contract

- Logical canvas: 64 × 76 px.
- Anchor: `(32, 70)` with the feet on baseline `y = 70`.
- Default facing: right, toward enemies. Mirroring is renderer-controlled.
- Proportion: approximately 3.5 heads tall with a 24 × 23 px facial area.
- Contact shadow: stepped 38 × 6 px soft silhouette.
- Weapon bounds: x `-25..29`, y `-67..4`; exceptional attack poses may extend a few pixels beyond it.
- Outline: near-black `#171525`, normally 2–4 logical pixels.
- Highlights: one deliberate upper-left cluster; sprite bodies use flat color clusters, not gradients.
- Class color is the existing `CLASS_DEFS.color`; each hero also has a fixed light, dark, and accent palette.
- Minimum mobile display height: 58 CSS px.
- Combat scale: 1.08 at the 960 × 500 logical battle canvas.
- Selection card scale: 1.08, rendered into a dedicated pixelated canvas.

## Silhouette language

- Guardian: broad plate torso, forward tower shield, short blade, cyan steel.
- Warrior: open stance, exposed two-handed greatsword, red-orange armor.
- Ranger: asymmetrical hood, quiver, longbow with readable string and arrow, green leather.
- Rogue: narrow stance, trailing scarf, twin daggers, purple shadow cloth.
- Mage: split robe, pale hair ornament, crystal-tipped staff, indigo arcane palette.
- Priest: cream mantle, gold sun focus, supportive raised hand, no real-world religious symbol.

## Animation states

`idle`, `attack`, `hurt`, `ko`, `skill`, `brave`, and `victory` share one procedural pose contract. Motion uses small whole-body offsets plus class weapon/limb transforms. There is no secondary animation loop: the game’s existing `requestAnimationFrame` loop supplies time and state progress.

## Asset origin and license

- Source: original programmatic shapes authored for God Brave in `src/hero-visuals.js`.
- Generation method: deterministic Canvas 2D rectangles and snapped polygon/pixel-line clusters.
- Third-party or downloaded sprite sheets: none.
- Commercial game sprites, palettes, poses, costumes, faces, or UI assets: none used.
- Repository-use status: original project code/assets; no external attribution requirement.

These are production-ready intermediate game sprites, not claimed as final commercial illustration. Their data-driven boundary allows later replacement with authored sprite sheets without changing combat logic.
