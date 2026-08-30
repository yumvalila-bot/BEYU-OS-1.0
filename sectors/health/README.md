# BEYU Health OS — Marketing Site

A React 19 + Vite 7 + Tailwind 4 implementation of the BEYU Health OS landing page, packaged with `vite-plugin-singlefile` so the entire site builds into a single self-contained HTML file.

## Stack

- **React 19** + **TypeScript 5.9**
- **Vite 7** with `@vitejs/plugin-react`
- **Tailwind CSS 4** (via `@tailwindcss/vite`)
- **`clsx` + `tailwind-merge`** for class composition (a `cn()` helper is included at `src/lib/cn.ts`)
- **`vite-plugin-singlefile`** — the production build inlines JS and CSS into `dist/index.html`

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # produce a single-file build in dist/
npm run preview  # serve the production build locally
```

## Project structure

```
src/
  components/
    TopBar.tsx
    Nav.tsx          # also exports <BrandMark /> for the footer
    Hero.tsx
    OsCard.tsx       # the navy "Control Surface" preview card
    Pillars.tsx      # also exports <SectionHeader /> used elsewhere
    Platform.tsx
    Modules.tsx
    Trust.tsx
    CtaBand.tsx
    Footer.tsx
  lib/
    cn.ts            # clsx + tailwind-merge helper
  App.tsx
  main.tsx
  index.css          # Tailwind import + @theme tokens + component classes
```

## Design tokens

All colors, fonts, and spacing are defined in `src/index.css` under a Tailwind 4 `@theme` block:

- **Navy scale** (`navy-50` … `navy-950`) — the brand's primary surface
- **Gold scale** (`gold-50` … `gold-900`) — the accent / "B" crest color (`#D4AF37`)
- **`ivory`** / **`ivory-dark`** — page backgrounds
- **`ink`** — body text
- Fonts: `--font-sans` (Inter) and `--font-serif` (Playfair Display)

Component-level classes (`.eyebrow`, `.btn-primary`, `.btn-ghost`, `.btn-gold`, etc.) are defined under `@layer components` for re-use across the page.
