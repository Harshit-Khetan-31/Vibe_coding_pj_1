# Harshit — Portfolio: the flight-profile site

> **Execution rule:** on acceptance, do **Phase 0 only**, then stop and report. Each later phase
> is requested separately. This document is saved to the project as `PLAN.md` in Phase 0.

## Context

`Harshit_Project1/CLAUDE_1.md` specifies a personal portfolio: a 2D editorial site over one
persistent 3D world, five sections, restrained motion, near-black palette, mono HUD details.
`harshit-portfolio/` currently holds ~558 lines of Phase-1 scaffold (Vite + React + TS, Lenis,
a rail nav, a CSS/SVG grid backdrop, placeholder sections). Three.js is installed but unused.

Two decisions from this session change the concept:

1. **The abstract "artifact" is dropped.** The persistent object is an **aircraft**, and scroll is
   a **flight profile**: runway → takeoff → climb → cruise → turbulence → descent → landing.
   This is the structural backbone the Active Theory "spine" inspired, re-derived rather than copied.
2. **SVG first, WebGL immediately after.** The full flight ships in SVG/DOM + GSAP, then gets its 3D
   upgrade before any section work. The SVG layer is kept permanently as the no-WebGL fallback.

The scaffold's current identity (Archivo Expanded / Newsreader / `#9b8cff`) is discarded in favour of
the spec's tokens. Project media does not exist yet, so WORK ships with procedural placeholder panels
and `// TODO` content entries. No achievements, projects or qualities get invented.

**Aircraft style — my call, since you left it to me:** a hairline **SVG line-art glyph** in Phase 1,
upgraded to a low-poly 3D aircraft in Phase 2 flying the same sampled path. The glyph sits at the same
stroke weight as the HUD so the whole site reads as one instrument, and it stays as the fallback when
WebGL is unavailable. Uniqueness comes from *behaviour* — see the interaction list in Phase 1.

---

## The flight profile

Five sections only. There is no separate qualities section: the qualities list lives **inside INTRO**,
revealed during the climb.

| Progress | Phase | Section | World |
|---|---|---|---|
| 0.00–0.08 | ON BLOCKS | 01 INTRO | Plane parked on a runway line, engines idling, HUD boots |
| 0.08–0.20 | ROTATION | 01 INTRO | Takeoff roll, nose lifts, path angles upward |
| 0.20–0.38 | CLIMB | 01 INTRO | Qualities list reveals as the plane climbs past each entry |
| 0.38–0.62 | CRUISE | 02 WORK | Path steadies; projects are waypoints passed in sequence |
| 0.62–0.76 | TURBULENCE | 03 EXPERIMENTS | Path goes noisy, airframe jitters, instruments flicker |
| 0.76–0.90 | DESCENT | 04 ABOUT | Everything slows; path flattens, sparse, calm |
| 0.90–1.00 | TOUCHDOWN | 05 CONTACT | Landing, contrail cuts, deliberate ending |

## Hard layout constraint — the path lives in the margins

The flight path routes through **margins and gutters only**. It never crosses a heading, a body
paragraph or a media panel. This is enforced structurally, not by eyeballing:

- `profile.ts` control points keep lateral `x` inside margin bands (outer ~10% each side) plus the
  central gutter of the 12-column grid; crossings of the text column are only permitted in the vertical
  gaps *between* sections, where no text exists.
- The bands are derived from the same CSS variables the grid uses, so a margin change moves the path too.
- A dev-only overlay (`?debug=path`) draws the text-safe rectangles over the path so violations are
  visible rather than argued about.

## Architecture — one path, one loop

Everything derives from a single curve. This is the core constraint that keeps it coherent.

- **`src/flight/profile.ts`** — the flight as normalized control points (`x` lateral 0–1, `y` progress
  0–1) plus named phase boundaries. Tuning the flight means editing this file, nothing else.
- **`src/flight/path.ts`** — builds one SVG path string (Catmull-Rom → cubic) from those points, and
  samples it with the native `SVGGeometryElement.getTotalLength()` / `getPointAtLength()` APIs.
  Tangent = two samples a few px apart → bank/pitch angle. No motion-path plugin, no extra dependency.
- **`src/flight/store.ts`** — module-level subscribable holding `{ progress, velocity, phase, point, angle }`.
  One rAF loop driven by Lenis writes it; subscribers write straight to the DOM. **React re-renders only
  when `phase` changes**, never per frame. The 3D layer in Phase 2 subscribes to this same store.
- **`src/flight/FlightLayer.tsx`** — one absolutely-positioned SVG spanning document height: path stroke,
  contrail, waypoint markers, aircraft group. `aria-hidden`. Sits behind all content.
- **`src/components/hud/`** — mono instruments (`ALT`, `GS`, `HDG`, phase label, section index) fed by
  the same store; values are functions of progress and tangent, so they are never arbitrary.

Existing code that survives: [useLenis.ts](harshit-portfolio/src/hooks/useLenis.ts) (rewired to drive the
single rAF loop) and [useActiveSection.ts](harshit-portfolio/src/hooks/useActiveSection.ts) (kept for
section state / nav). [GridField.tsx](harshit-portfolio/src/backdrop/GridField.tsx) is replaced by the
flight layer; its damped-pointer pattern is reused for the cursor parallax.

---

## Phases

### Phase 0 — ground crew  *(the only phase to run on acceptance)*
- Save this document as `harshit-portfolio/PLAN.md`.
- Copy the spec to `harshit-portfolio/CLAUDE.md` (so it auto-loads), amended: artifact → aircraft,
  flight profile. Append verbatim:

  ```
  ## Plan
  Build order and architecture live in PLAN.md. Read only the phase you are asked for.
  Sections: 01 INTRO, 02 WORK, 03 EXPERIMENTS, 04 ABOUT, 05 CONTACT. The "qualities" list sits inside INTRO (no extra section).
  The flight path routes through margins and gutters and never crosses headings or body text.
  ```
- Rewrite `src/styles/tokens.css` to spec: `--bg #070708`, `--fg #ECEAE4`, `--dim #7A7873`, `--line`, `--accent #4B63FF`.
- Fonts: Big Shoulders Display + Inter Tight self-hosted woff2 in `public/fonts/`, preloaded.
  **Departure Mono is not on Google Fonts** — it needs a download from departuremono.com; if that fails
  I'll flag it and fall back to a system mono stack rather than silently substituting.
- Add Tailwind v4 (`@tailwindcss/vite`), GSAP + ScrollTrigger, `react-router-dom`, `vite-plugin-glsl`.
- Add `typecheck` and `lint` scripts (spec lists them; they don't exist). ESLint flat config, TS strict.
- Verify: `npm run typecheck && npm run build && npm run dev` still serve the existing placeholders
  on the new tokens and fonts. No flight code yet.

### Phase 1 — the flight system, SVG *(the phase that decides whether this works)*
- `profile.ts`, `path.ts`, `store.ts`, `FlightLayer.tsx`, aircraft glyph, contrail, HUD instruments,
  margin-band routing + `?debug=path` overlay.
- Interaction budget — this is where "interactive and unique" is earned:
  - banks toward the cursor's side and eases back on idle
  - throttle/contrail length tracks scroll velocity; fast scroll = long trail, stop = trail dissipates
  - nose pitch from path tangent, with overshoot and settle (`expo.out`)
  - idle drift when the page is untouched
  - instruments read out live and call out waypoints on approach
- Sections stay as placeholders. Verify 60fps with DevTools before moving on.

### Phase 2A — concept change: free flight, no path (SUPERSEDES Phase 2 below)

The visible route is **dropped**. There is no SVG spine, no dashes, no waypoint markers — the aircraft
flies freely in a realistic 3D dusk sky and the page reads as an editorial layer over a real world.

- `src/flight/store.ts` keeps its job (progress, velocity, phase, section) but no longer resolves a
  curve. `src/flight/track.ts` maps progress → phase / section / instrument values from the measured
  section boxes; `path.ts`, `FlightLayer.tsx` and `PathDebug.tsx` are gone.
- One lazy-loaded `<Canvas>` behind the DOM, `pointer-events: none`, DPR ≤ 1.75, frameloop paused
  while the tab is hidden. drei `<Sky>` at dusk (low warm sun), soft fog, and the same sky baked once
  into an environment map so the aircraft is lit by the sky it flies in.
- Three parallax `<Clouds>` layers (near / mid / far). **The world moves, not the camera:** clouds
  stream toward the viewer at base cruise speed + scroll velocity, and recycle when they pass behind.
- Aircraft: a real glTF (`public/models/plane.glb`, meshopt + webp), normalized in code — centered,
  nose rotated to −Z, and auto-scaled from its bounding box to ~30% of viewport width on desktop and
  ~55% on mobile, at any screen size.
- Flight model, all critically damped springs: the plane holds a screen zone on the side opposite the
  active section's text and glides to the next one; coordinated turns (roll leads, yaw follows), a
  pitch-up on fast scroll that settles, idle bob plus low-frequency turbulence noise, propeller spin
  tied to speed. No keyframes anywhere, so fast flicks and reversals cannot snap.
- Fallback for reduced motion or no WebGL: a static dusk gradient and a still aircraft glyph.
- The aircraft model is CC BY — the footer credit line is a `// TODO` until the footer exists.

### Phase 2 — WebGL upgrade (superseded by 2A)
- One shared `<Canvas>` behind the DOM, three.js lazy-loaded behind a capability check.
- Low-poly aircraft flying the *same* sampled path, subscribed to the same store; per-phase world states
  (atmosphere, light, depth) interpolated, never swapped.
- **The SVG layer stays** as the fallback for no-WebGL, low-power and `prefers-reduced-motion`; both
  renderers read one source of truth, so they can never disagree.

### Phase 3 — intro (with the qualities climb)
- `src/sections/Intro.tsx`: name in giant Big Shoulders, statement, boot line (≤1.5s, skippable).
- `src/content/intro.ts` holds the statement **and** the qualities list as typed `// TODO` entries;
  each quality reveals by line-mask as the plane climbs past its Y. Placeholder words, real animation.

### Phase 4 — work waypoints
- `src/content/projects.ts` (number, title, category, description, tech, link — all `// TODO`).
- `src/sections/Work.tsx` + `WaypointItem`: proximity to the waypoint drives active state; title pulls
  forward in large type, a media panel unfolds in place, neighbours dim. No cards.
- Media panel with no media yet: framed placeholder with coordinate tags and a scanline fill, built so a
  `<video>`/image swaps in with no layout change.
- Router in place; `/work/:slug` detail page stubbed.

### Phase 5 — experiments + about
- Experiments: turbulence state; small lazy-mounted interactive pieces (`01 particles`, `02 physics`,
  `03 type`), each self-contained and only mounted in view.
- About: descent state, large type, heavy negative space, factual copy only.

### Phase 6 — landing
- Contact: path flattens to a runway, touchdown, contrail cuts, world fades — a deliberate ending.
- Contact links as a split-flap departure board (one orchestrated moment, aviation-native, not borrowed).
- Film grain overlay, final HUD state `ON BLOCKS`.

### Phase 7 — polish
- Touch: Lenis off, native scroll, simplified path, no cursor effects.
- `prefers-reduced-motion`: plane parked, path static, fades only, no boot.
- A11y: landmarks, focus rings in `--accent`, keyboard-reachable waypoints, `aria-hidden` on all instruments.
- Budget check: initial JS < 250KB gz, LCP < 2.5s, DPR cap 1.75, pause on hidden tab. Vercel config.

---

## Verification

Per phase: `npm run typecheck && npm run build`, then `npm run dev` and check by hand at **375 / 768 / 1440**.

Specific to this design:
- **Aircraft never covers text.** (2A) At all three widths, scroll the full page: the aircraft holds
  the side opposite the text column and never crosses into it, including at full drift and full bank.
- **Scroll the full page slowly and fast.** Plane must never leave the path, jump, or flip its bank angle
  at phase boundaries. Fast flicks are the failure case — check both directions.
- **Fallback reads as intentional** (2A): force reduced motion and force WebGL off; both must show the
  painted dusk and a still aircraft, with the HUD still resolving phase and section from the store.
- **DevTools Performance**, 6× CPU throttle, scroll for 10s: no long tasks, no per-frame React renders
  (React DevTools Profiler silent except at phase changes).
- **Reduced motion** on: no boot line, no takeoff, plane parked, content fully readable.
- **JS disabled / WebGL off:** the site still reads as intentional (spec requirement).
- Resize mid-flight — the path resamples without the plane teleporting.

## Open items (not blockers)

- Real content for qualities, projects, experiments and about — all ship as typed `// TODO`.
- Project media (video/images) — panels are built to receive them later.
- Departure Mono licence file needs fetching; flagged above.
