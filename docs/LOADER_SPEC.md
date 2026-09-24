# Loader + propeller spec

Implement only the section you are asked for. Read only the files listed there. Reuse what exists. Report in the CLAUDE.md format.

## A: Propeller
Files: src/gl/Plane.tsx, src/gl/Propeller.tsx, src/gl/config.ts

- **Measure** in `normalize()`: from fuselage vertices within 2% of span behind min z, get spinner centre (x,y), spinner back z, spinner radius, and fused blade tip radius. Return them in `Normalized`. Log once in dev.
- **Remove fused blades:** rebuild the fuselage index without triangles whose 3 vertices sit in that slab AND lie outside spinner radius × 1.15. Keep the spinner and cowling.
- **Mount:** put `<Propeller>` at the measured centre and back z, with radius = measured tip radius. Delete `PROP_RADIUS_FRACTION`, and use the measured radius in `setPropellerCoverage` too. Drop the procedural hub and cone if they overlap the model's spinner.
- **Blades:** per-vertex twist (root steep, tip 25° flatter). Satin dark material (metalness .3, roughness .55) on the scene env map. Last 8% of each blade in #E8B923.
- **Disc:** max opacity .22, darkened tint, radial falloff, faint banding, thin yellow tip ring, slightly brighter on the sun side. Keep the finale boost.
- **Speed:** never stops. Keep the 12 rps cap. No pop in the blade↔disc cross-fade.
- **Nav lights:** additive sprites. Red on the left wingtip, green on the right, white tail strobe double-flashing every 1.4s. Positions from the bounding box, at wing height. Just above the bloom threshold.
- **Check:** nose at top of page, mid-page, and in the finale.

## B: Runway loader
Target: `docs/loader-reference.html`. Port its `draw()` into `src/components/loader/runway.ts` by copying it and adapting it minimally; don't rewrite it. Drop the reference's own HUD, sky and plane.
Files: new `src/components/loader/{Loader.tsx,Loader.css,runway.ts}`. Edit `flight/store.ts`, `flight/profile.ts`, `components/hud/Hud.tsx`, `gl/World.tsx`, `gl/Plane.tsx`, `sections/Intro.tsx`+`.css`, `App.tsx`, `hooks/useLenis.ts`.

- **Overlay:** a fixed canvas above everything, drawn by its own rAF loop with refs only. No React state or layout reads per frame. `<Scene>` mounts underneath from the start.
- **HUD:** use the real `<Hud>`. Add `state.loader={active,altitude,speed,heading,phaseLabel,callout}` and have the Hud prefer it while active. HDG reads 110 (runway 11). Add `HEADING_OFFSET` so the Intro pose also reads ~110.
- **Progress:** fonts 10%, Scene chunk 25%, glTF and textures via `useProgress` 50%, `gl.compile` + 2 rendered frames → `worldReady` 15%. Smooth the display (tau .09s), monotonic. 100% requires `worldReady`.
- **Sequence** (reference timings):
  - Loading: lights follow progress, idle pulse, tremor, beacon. Phase ON BLOCKS, call-out RWY 11.
  - Hold .75s: CLEARED FOR TAKEOFF, counter fades, skip hint shows.
  - Takeoff 3.3s: GS 0→152, V1 at 108, ROTATE at 126 (phase ROTATION). Then pitch-up and cloud, POSITIVE CLIMB (phase CLIMB), ALT →1480.
  - Handoff: canvas fades to the real 3D sky, entry runs, `revealSection(0)`, Nav shows, loader unmounts.
- **Entry (`Plane.tsx`):** `state.entry` 0→1 over the last 1.2s. The target blends from below and behind the camera (HEADING_AWAY, slight bank) to the normal Intro target. Blend targets, never snap the springs. After entry, the existing TOP_SETTLE takes over.
- **Profile:** CLIMB starts at {s:0,u:0}. Remove ON_BLOCKS and ROTATION from PHASES (keep their type ids) and the RWY waypoint. ALT and SPEED keys start at 1480 / 152. No HUD jump at handoff.
- **Input:** pointer parallax (hover devices only, smoothed). Any key or click after 100% plays the takeoff at 4× speed. Scroll locked while active (`lenis.stop`, `scrollRestoration='manual'`, scroll to top).
- **Robustness:**
  - dt clamped to 1/20s.
  - Hidden tab pauses; reset the clock on return.
  - Resize without restarting; DPR ≤1.75.
  - glTF error or a 12s stall → fade to the fallback.
  - Plays once per session (sessionStorage).
  - Reduced motion or no WebGL → counter, then fade.
  - Canvas aria-hidden; counter role=progressbar.
  - 60fps at 6× CPU throttle.
- **Remove** the Phase 3 boot line (`useBootLine`, `.intro__boot`).
- **Check:**
  - Normal load and Slow 3G.
  - Skip mid-roll.
  - Tab switch mid-takeoff.
  - Resize.
  - Reduced motion and WebGL off.
  - Second load in the same session.
  - Widths 375/768/1440.
