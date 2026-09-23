# CLAUDE.md — Harshit / Portfolio

Personal portfolio for Harshit: a college student with an engineering background who works across technology, robotics, film/content and experiments.

Core idea: *"I am still figuring out what I want to build — so I keep building things."* The site reveals who Harshit is through interaction, not explanation.

Tone: intelligent, creative, slightly mysterious, technically curious. Not corporate, not a résumé.

## References = inspiration only
Orage Studio (console/HUD details, windowed media), Active Theory (WebGL work gallery), Alche (smooth scroll, shader transitions, spatial feel). Borrow techniques and the level of craft. Never copy their layouts, logos, copy, fonts or signature compositions. If a component looks like it came straight from one of them, change it.

## Concept: a 2D editorial site over one continuous flight
Not a 3D website with some text on it. Editorial typography carries the content; one persistent world behind it changes state as you scroll. That world is a flight: the page is a single flight profile, and the **aircraft** is the persistent object — it replaces the abstract "artifact" this spec originally described.

```
INTRO       dark, almost empty → the aircraft sits on a runway line, instruments boot
            → takeoff roll, rotation, climb; the qualities list reveals as it climbs
WORK        giant type at cruise; projects are waypoints the flight passes
EXPERIMENTS turbulence — the path goes noisy, the airframe jitters, instruments flicker
ABOUT       descent; everything slows, calm and sparse
CONTACT     touchdown; the contrail cuts and the world fades — a deliberate ending
```
Since Phase 2A the flight is real 3D and the route is invisible: no drawn path, no waypoint markers. The aircraft is a glTF model flying in a dusk sky. Since Phase 2B it is seen from the **side / three-quarter**, not from behind, and it **crosses** the screen: one continuous serpentine weaves left ↔ right, changing sides only in the vertical gaps between sections and settling beside each section's text, never over it. Its behaviour: nose along the direction of travel, banked into every turn, a pitch-up on fast scroll that settles, idle bob and light turbulence, a real 3-blade propeller whose blades cross-fade into a blur disc with rpm, a lean toward the cursor. A sustained reversal of travel produces a banked 180° U-turn through the front — the aircraft is never seen tail-first. Scroll progress drives altitude, so every HUD number is a function of it and never arbitrary.

## Sections (in order)
`01 INTRO` · `02 WORK` · `03 EXPERIMENTS` · `04 ABOUT` · `05 CONTACT` (+ `/work/:slug` detail pages)
- WORK: each project has number, title, category, short description, technology, link. Editorial/spatial list, no cards. Projects appear progressively.
- EXPERIMENTS: small, lightweight interactive pieces (01 particles, 02 physics, 03 type, …). Never a giant WebGL app.
- ABOUT: personal and factual only (engineering, robotics, film, experiments; "some work, some doesn't"). Large type, lots of negative space.
- CONTACT: email, GitHub, LinkedIn, Instagram (optional). Extremely large type, minimal footer.

## Stack (no new packages without a reason in the plan)
- Vite + React 18 + TypeScript (strict), React Router
- Tailwind CSS v4; tokens as CSS variables in `src/styles/tokens.css`
- three + @react-three/fiber + @react-three/drei: ONE shared `<Canvas>` for the whole app
- GSAP + ScrollTrigger; Lenis (synced to ScrollTrigger, off on touch)
- GLSL files in `src/gl/shaders/` (vite-plugin-glsl)
- Deploy: Vercel (static)

## Commands
`npm run dev` · `npm run build` · `npm run preview` · `npm run typecheck` · `npm run lint`

## Structure
```
src/
  content/          # intro.ts, projects.ts, experiments.ts: ALL copy and data. No hardcoded content in components.
  styles/           # tokens.css, fonts.css, global.css
  components/       # hud/ (instruments), ui/ (type reveals, links, cursor)
  sections/         # Intro, Work, Experiments, About, Contact
  flight/           # profile.ts (the flight as data), track.ts (progress -> phase/section), store.ts (one rAF loop)
  flight/route.ts   # the serpentine + the finale window, as a function of progress
  gl/               # World.tsx (lazy canvas + fallback), Scene.tsx (sky/light/fog), Plane.tsx, Propeller.tsx, CloudField.tsx
  hooks/            # useLenis, useSectionState, useReducedMotion, useIsTouch
  pages/            # Home.tsx, Project.tsx
public/fonts/       # self-hosted woff2 (see FONTS.md)
public/media/       # webp/avif images, mp4 + webm videos, posters
```

## Design system
- Colors: `--bg #070708`, `--fg #ECEAE4` (off-white), `--dim #7A7873`, `--line rgb(236 234 228 / .1)`, `--accent #4B63FF` (one accent, used rarely: active state, focus, one key word per view at most)
- Type: `Big Shoulders Display` (giant editorial headlines, tight tracking), `Inter Tight` (body), `Departure Mono` (small HUD/meta only: coordinates, counters, indexes). Self-host woff2 and preload.
- Layout: asymmetric editorial grid (12 columns, generous margins), large-scale type, deliberate negative space, a subtle film grain overlay, depth from the 3D layer.
- HUD details, used sparingly: section index `02 / WORK`, a small cursor XY readout on desktop, coordinate tags on media frames, a short console-style boot line on first load (at most 1.5s, skippable).
- Motion: restrained. One orchestrated moment per section. Headlines use line-mask reveals; mono labels decode/scramble. Eases `expo.out` (UI) and `power3.inOut` (world transitions). No fade-up on everything, no SaaS cards, no gradient blobs, no emoji icons.

## Rules
- Content only in `src/content/*`. Missing data → typed placeholder marked `// TODO`. Never invent achievements.
- One fixed canvas behind the DOM. World state is driven by the active section (`useSectionState`) and interpolated, never swapped abruptly. DOM media that needs shader effects registers its rect so GL planes follow it.
- The site must feel intentional with the 3D disabled (fallback: a painted dusk gradient and a still aircraft glyph — `src/gl/SkyFallback.tsx`).
- Performance: 60fps on a mid laptop, LCP < 2.5s, initial JS < 250KB gz (three.js lazy-loaded), DPR capped at 1.75, pause rendering when the tab is hidden, dispose GL resources on unmount, lazy-load experiments only when in view.
- Mobile/touch: simplified world (fewer particles, cheaper shaders), no cursor effects, native scroll, video posters.
- `prefers-reduced-motion`: no boot sequence, no scroll-driven distortion, world stays static, fades only.
- A11y: semantic landmarks, visible focus (accent outline), full keyboard navigation, alt text from content, contrast ≥ 4.5:1.
- Prefer subtraction over addition. Don't add complexity just to look impressive.

## Working protocol (every "PHASE X" prompt)
1. Inspect: read only the files relevant to the phase; reuse what exists.
2. Plan: at most 8 bullets (goal, files, interaction approach, performance, risks). Then implement immediately; only ask if something is truly ambiguous or risks destroying work.
3. Implement only that phase. Don't touch unrelated sections or rewrite working code.
4. Test: `npm run typecheck && npm run build`, check the dev console, check 375 / 768 / 1440px widths, fix the issues you introduced.
5. Report only: IMPLEMENTED (3–5 bullets), FILES, TESTED, ISSUES (unresolved only).
- Be terse. No tutorials, no restating requirements, no docs or features that weren't asked for.
- Commit at the end of each phase: `feat(phase-X): <summary>`.

## Plan
Build order and architecture live in PLAN.md. Read only the phase you are asked for.
Sections: 01 INTRO, 02 WORK, 03 EXPERIMENTS, 04 ABOUT, 05 CONTACT. The "qualities" list sits inside INTRO (no extra section).
There is **no visible flight path**. The aircraft flies freely in a realistic 3D dusk sky (Phase 2A):
one lazy R3F canvas behind the DOM, drei `<Sky>` at dusk, three parallax cloud layers that stream past.
The world moves, the camera does not. All motion is critically damped springs — never keyframes — so
nothing snaps on a fast flick or a reversed scroll.
`src/flight/store.ts` stays the single source of truth (progress, velocity, phase, section, reveals);
the GL layer reads it and writes the aircraft's attitude and lateral drift back for the HUD and clouds.

Phase 2B (current):
- **Side / three-quarter view.** The camera is untouched — the *aircraft* turns. Its heading lives on
  one arc centred on "nose at the camera"; flying-right and flying-left sit the same distance either
  side. A spring between them therefore sweeps through the front, which is the U-turn, the
  three-quarter view and the no-tail-first guarantee in one mechanism.
- **Serpentine.** `src/flight/route.ts` is the whole route as a pure function of progress. Sides
  change only between `u = 0.86` of one section and `u = 0.14` of the next, where the middle band of
  the screen is empty; the aircraft climbs through the gap as it crosses.
- **Reversal.** A hysteresis gate (speed threshold + dwell, `stepGate` in `src/gl/spring.ts`) decides
  a reversal is real before the aircraft commits, so jitter cannot start a U-turn. Up and down are
  the same curve, mirrored.
- **Section reveal.** Line-mask + fade, triggered by the store when the aircraft passes the section.
  Sticky. Nav clicks reveal instantly (`revealSection`); reduced motion reveals with no transition.
- **Finale.** The last ~15% of the scroll: the aircraft centres, turns nose-on, and flies through the
  camera with its propeller disc filling the frame, clearing the screen for CONTACT. It is a pure
  function of progress, so scrolling back up replays it in reverse — nose *away* while receding.
