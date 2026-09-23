# Harshit — Portfolio

A personal portfolio site built as a scroll-driven **flight profile**: a single persistent
aircraft flies a path through the page — runway → takeoff → climb → cruise → turbulence →
descent → landing — with each phase mapped to a section (Intro, Work, Experiments, About,
Contact). Editorial 2D layout over one continuous 3D/SVG world, restrained motion, near-black
palette, mono HUD details.

Built with Claude Code as a first experiment in AI-assisted front-end development.

## Stack

- [Vite](https://vitejs.dev/) + React + TypeScript
- [Three.js](https://threejs.org/) / [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) for the 3D aircraft and scene
- [GSAP](https://gsap.com/) for scroll-linked animation
- [Lenis](https://github.com/darkroomengineering/lenis) for smooth scrolling
- [Tailwind CSS](https://tailwindcss.com/) for styling

## Getting started

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build      # type-check and build for production
npm run preview     # preview the production build locally
npm run typecheck   # run TypeScript checks only
npm run lint         # run ESLint
```

## Project structure

- `src/` — application source (scene, sections, path/flight-profile logic)
- `public/` — static assets
- `plane.glb` — 3D aircraft model
- `PLAN.md` — design and implementation plan for the site
- `FONTS.md` — typography reference

## Credits & licensing

Third-party assets bundled in this repo, with their licence terms:

| Asset | Source | Licence |
|---|---|---|
| Aircraft model — Socata ST 10 "Diplomate" | [helijah on Sketchfab](https://sketchfab.com/3d-models/socata-st-10-diplomate-2c0eba4e3e9545289c50fc739b49a815) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Big Shoulders Display | Google Fonts | SIL OFL 1.1 |
| Inter Tight | Google Fonts | SIL OFL 1.1 |
| Departure Mono | [departuremono.com](https://departuremono.com) (Helena Zhang) | SIL OFL 1.1 |
| `public/textures/cloud.png` | `pmndrs/drei-assets` (the @react-three/drei default cloud sprite) | none declared upstream |

This work is based on "Socata ST 10 "Diplomate""
(https://sketchfab.com/3d-models/socata-st-10-diplomate-2c0eba4e3e9545289c50fc739b49a815)
by helijah (https://sketchfab.com/helijah) licensed under CC-BY-4.0
(http://creativecommons.org/licenses/by/4.0/)

CC BY 4.0 requires that credit to remain visible wherever the work is shared, so it is
also rendered in the site's CONTACT footer — don't remove it. Full licence texts ship
alongside the assets: `plane.glb/license.txt` for the model, `public/fonts/*-OFL.txt`
for the fonts (see [FONTS.md](FONTS.md)).

No licence is declared for this repository's own source, so all rights to it are
reserved by default.

## Status

Work in progress — first portfolio site built with Claude Code. Great experience so far, still
being refined.
