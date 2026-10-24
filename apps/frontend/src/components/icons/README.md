# Animated icons

Icons in this folder come from [lucide-animated.com](https://lucide-animated.com)
(MIT licensed, built on [Motion](https://motion.dev) and
[Lucide](https://lucide.dev)).

`Icon` (`src/components/ui/Icon.tsx`) renders an animated icon when the
Material Symbols name is mapped in `icon-map.ts`, and otherwise falls back to
the Material Symbols font. Callers use `Icon` exactly as before.

## Files

| File | Purpose |
| --- | --- |
| `icon-map.ts` | Material Symbols name → animated component. |
| `animated/<slug>.tsx` | Vendored component for each lucide-animated icon. |
| `animated/index.ts` | Barrel re-exporting every vendored component. |

## How the components were vendored

Each component is the exact registry payload from
`https://lucide-animated.com/r/<slug>.json`, with these mechanical changes so it
drops into this app without a shadcn setup:

1. `"use client"` removed (not meaningful in Vite).
2. `import { cn } from "@/lib/utils"` replaced with `clsx` (already a dependency).
3. The root `<div>` became a `<span>` so icons stay inline, matching the
   previous Material Symbols markup.
4. `width`/`height` are `1em` instead of a `size` prop, so the icon follows
   `font-size` exactly like the Material Symbols font did. `Icon` keeps setting
   `fontSize` from its `size` prop, so every existing call site is unchanged.
5. Empty `interface XProps extends HTMLAttributes<...> {}` became a `type`
   alias to satisfy `@typescript-eslint/no-empty-object-type`.

Upstream hover animations, `startAnimation`/`stopAnimation` handles, and SVG
markup are untouched.

## Adding an icon

1. Download the component:

   ```powershell
   Invoke-WebRequest "https://lucide-animated.com/r/<slug>.json" -OutFile "<slug>.json"
   ```

2. Save `files[0].content` as `animated/<slug>.tsx`, applying the five changes
   above.

3. Re-export it from `animated/index.ts`.

4. Add `'<material_symbol_name>': <Slug>Icon` to `icon-map.ts`.

## Notes

- `filled` has no Lucide equivalent. `Icon` thickens the stroke instead so
  active and emphasis states still read as heavier.
- `weight` maps to a stroke width (`400` = Lucide's default `2`).
- Names without a lucide-animated counterpart stay on the Material Symbols
  font, which `index.html` still loads. That font must stay until every name
  is mapped.
