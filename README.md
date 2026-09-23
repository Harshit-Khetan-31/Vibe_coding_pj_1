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

## Status

Work in progress — first portfolio site built with Claude Code. Great experience so far, still
being refined.
