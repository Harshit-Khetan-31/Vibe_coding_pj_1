# Runway loader: Claude Code prompts

Run these in order. Type `/clear` before each one, send one at a time, and check the result in the browser before sending the next.
`docs/loader-reference.html` is the approved design. Open it in a browser to see the target.

---

## Prompt A: make the propeller part of the aircraft

```
PROPELLER REALISM. Touch only src/gl/Plane.tsx, src/gl/Propeller.tsx, src/gl/config.ts.

Why it looks detached (verified in the code):
1. Plane.tsx mounts <Propeller> at x=0,y=0,z=-noseOffset*0.99. That is the bounding-box centre, not the thrust line. On a low-wing aircraft with a tall fin, the box centre is not the spinner, so the disc floats off the nose.
2. The glTF's own propeller is fused into the airframe mesh (model.fuselage). Its static blades still render behind the spinning ones.
3. The radius is a guess: PROP_RADIUS_FRACTION = 0.19 of the span.
4. The blur disc is bright cream (#ffeacf), so it reads as a glowing plate.

Do this:
- MEASURE, do not guess. In normalize(), after orientation and centring, take the fuselage vertices in the front-most slab of the nose (within ~2% of span behind the minimum z). From those vertices derive: spinner centre (x,y), spinner back-face z, spinner radius, and fused blade tip radius (the max distance from the thrust axis within that slab). Return them in Normalized. Log them once in dev.
- REMOVE the fused static blades. Rebuild the fuselage geometry's index without the triangles whose three vertices all lie in that nose slab AND farther from the thrust axis than the spinner radius × 1.15. Keep the spinner and cowling. Do this once at load, on the cloned geometry. Verify by temporarily hiding <Propeller>: the nose must show a clean spinner with no blade stubs.
- MOUNT <Propeller> at the measured spinner centre and back-face z, with radius = measured tip radius. Delete PROP_RADIUS_FRACTION and feed the same measured radius to the setPropellerCoverage calculation, so the CONTACT reveal timing stays correct.
- SPINNER: keep the model's own spinner. Drop the procedural hub and cone if they overlap it. No z-fighting, and no visible gap between blade roots and the spinner.
- BLADES:
  - Give them real twist along the span: steep at the root, about 25° flatter at the tip, applied per vertex. The current code rotates a flat blade by a single PROP_BLADE_TWIST, which is not twist.
  - Material: dark satin, metalness ~0.3, roughness ~0.55, lit by the same environment map as the airframe.
  - Paint the last 8% of each blade a safety yellow (#E8B923), like real propeller tips. A vertex colour or a second material is fine.
- BLUR DISC:
  - Max opacity ~0.22 in cruise, a slightly darkened tint (not cream), soft radial falloff and faint banding.
  - A thin yellow tip ring, made by the painted tips smearing.
  - Slightly brighter on the side facing the sun.
  - Keep the existing finale boost so the close-up still fills the frame.
- SPEED: the propeller never stops (keep idle rps). Keep the 12 rps strobe cap. The blade→disc cross-fade must have no visible pop.
- NAV LIGHTS: add tiny additive sprites. Red on the left wingtip, green on the right, and a white tail strobe (double flash every 1.4s). Place them from the measured bounding-box extremes, at the wing's height. Make their emissive strength just above the bloom threshold (0.96) so they glow slightly.

Test: typecheck + build. Check the nose at the top of the page (front three-quarter), mid-page (side-on), and in the finale close-up. Report per CLAUDE.md.
```

---

## Prompt B: the runway loader

```
RUNWAY LOADER. Visual target: docs/loader-reference.html. Open it and copy its look and timing exactly: runway, lights, horizon, takeoff, cloud punch-through, call-outs. Its progress is simulated and its aircraft is a 2D stand-in. In the app, both are real.

Files: new src/components/loader/Loader.tsx + Loader.css + runway.ts (pure canvas drawing, ported from the reference). Edits: src/flight/store.ts, src/flight/profile.ts, src/components/hud/Hud.tsx, src/gl/World.tsx, src/gl/Plane.tsx, src/sections/Intro.tsx, src/App.tsx, src/hooks/useLenis.ts.

1. STRUCTURE
- One fixed <canvas> overlay above everything, inside <Loader/> in App.tsx. It is drawn by its own rAF loop with refs only: no React state per frame and no layout reads per frame.
- The 3D <Scene> mounts underneath immediately, as it does now, so it loads and compiles while the loader runs.
- The loader never replaces the HUD. Use the real <Hud/>: add a store override (state.loader = {active, altitude, speed, heading, phaseLabel, callout}) that Hud.tsx prefers while active. Delete the loader's own HUD copy from the reference.
- Runway 11: HDG reads 110 during the loader. Add HEADING_OFFSET to the Hud (or setAttitude) so the aircraft's Intro pose also reads ~110 after handoff. No jump.

2. REAL PROGRESS (no fake timer)
- Weights: fonts ready 10%, the three.js/Scene lazy chunk resolved 25%, glTF + textures via THREE.DefaultLoadingManager (drei useProgress) 50%, first frames rendered with shaders compiled 15%. For the last part, call gl.compile(scene, camera), then wait for 2 rendered frames, then set store `worldReady`.
- The displayed number approaches the target with an exponential smoother (tau ~0.09s). It never goes backwards and never passes the real value.
- 100% is only allowed once worldReady is true. Takeoff never starts before that. This is what keeps the takeoff smooth: nothing loads, parses or compiles during it.

3. SEQUENCE (timings from the reference)
- LOADING:
  - Lights sequence from threshold to far end, tied to progress. The red end bar lights exactly at 100%.
  - An idle pulse runs along the lit lights, so stalls never look frozen.
  - Faint engine tremor that grows with progress. The airport beacon flashes green/white on the horizon.
  - Phase ON BLOCKS, call-out "RWY 11".
- HOLD 0.75s: call-out CLEARED FOR TAKEOFF, the counter fades, and the skip hint appears.
- TAKEOFF 3.3s:
  - Roll with light streaks and vibration. GS rises from 0 to 152.
  - Call-out V1 at GS 108, ROTATE at 126. Phase ROTATION.
  - Pitch-up, horizon drops, cloud punch-through. Then POSITIVE CLIMB, phase CLIMB, ALT climbing to ~1,480.
- HANDOFF: as the cloud clears, the loader canvas fades out and reveals the real 3D sky, with no second sky. At the same moment the real aircraft flies in (step 4). Then the Intro reveals, the Nav shows, and the loader unmounts and frees its canvas.

4. THE REAL AIRCRAFT ENTRY (Plane.tsx)
- Add state.entry 0→1, driven by the loader over the last ~1.2s of the handoff. At entry 0 the aircraft's target is below and behind the camera, tail toward the viewer (HEADING_AWAY), with a slight bank. At entry 1 it is the normal Intro target.
- Blend the targets. Do not snap the springs, so the existing springs smooth it. After entry reaches 1, the existing TOP_SETTLE logic turns it to face the viewer.
- Propeller at climb rps during entry.

5. THE SITE STARTS IN THE AIR (profile.ts)
- The loader now owns the ground roll. At progress 0 the scroll profile must equal the loader's final state: phase CLIMB, ALT ~1,480, GS ~152.
- Make CLIMB start at {s:0,u:0}. Remove ON_BLOCKS and ROTATION from PHASES (keep the ids in the type for the loader's labels). Remove the RWY waypoint. Re-key ALTITUDE_KEYS and SPEED_KEYS so they start at those values and climb smoothly into CRUISE.
- Check the HUD shows no jump at the handoff.

6. INTERACTION
- Pointer parallax as in the reference: the view shifts slightly, with near lights moving more. Smoothed; desktop only (hover: hover).
- Skip: any key or click after 100% plays the takeoff at 4× speed. Never skip before the world is ready.
- Lock scroll while the loader is active: lenis.stop() plus overflow hidden, and history.scrollRestoration='manual' with scroll to top on load. Restore scroll on unmount.

7. MUST NEVER BREAK
- Time-based animation with dt clamped to 1/20s.
- A hidden tab pauses the loader. On return, resume from the same point (reset the clock; no jump).
- Resize mid-loader recomputes the canvas size and DPR (cap 1.75) without restarting.
- Failure: if the glTF errors, or progress stalls for more than 12s, skip the takeoff and fade to the site's existing fallback. The visitor is never trapped.
- Play once per session (sessionStorage). A repeat visit gets no loader.
- prefers-reduced-motion or no WebGL: counter only, then a plain fade. No roll, no parallax, no tremor.
- Canvas aria-hidden. The counter is role=progressbar with aria-valuenow. Nothing focusable is hidden under the overlay.
- Draw only what is visible. No per-frame allocations in hot loops beyond gradients. Hold 60fps with 6× CPU throttle in DevTools.

8. REMOVE the Phase 3 boot line (useBootLine and .intro__boot in Intro.tsx/Intro.css). The loader replaces it. Call revealSection(0) at handoff.

Test: typecheck + build. Then check:
- A normal load, and Slow 3G in DevTools: the pulse keeps moving, and the takeoff never stutters.
- Skip mid-roll.
- Switch tab away mid-takeoff and back.
- Resize mid-loader.
- Reduced motion on, and WebGL off.
- Reload twice in one session.
- 375 / 768 / 1440 widths.
Report per CLAUDE.md, with failures only.
```

---

## Prompt C: final check (optional)

```
Verify the loader → site handoff frame by frame. Record a DevTools Performance trace of a cold load at 6× CPU throttle and report any long task (>50ms) that lands during the takeoff or the handoff, plus what caused it. Fix only those. Confirm the HUD values and the aircraft position show no discontinuity at the handoff. No new features.
```
