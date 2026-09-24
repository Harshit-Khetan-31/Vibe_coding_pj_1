---
name: phase
description: Run one build phase of the portfolio under the project's working protocol. Use whenever the request names a phase ("PHASE 3", "phase 2C", "do the next phase", "implement WORK section") or asks for a scoped increment from PLAN.md. Enforces the inspect/plan/implement/test/report loop, the terse report format, and the per-phase commit convention.
---

# Running a phase

PLAN.md holds the build order. Each phase is requested separately and implemented alone.

## 1. Inspect

Read only the files the phase touches, plus the PLAN.md section for that phase. Do not read
the whole plan. Reuse what exists — most phases extend working code rather than replace it.

The load-bearing invariants, so a phase doesn't quietly break them:

- `src/flight/store.ts` is the single source of truth (progress, velocity, phase, section, reveals).
  The GL layer reads it and writes attitude and lateral drift back.
- `src/flight/route.ts` is closed-form over progress. Keep it closed-form — heading and bank are
  derived analytically, not differenced, so they stay clean at any scroll speed and read correctly
  in reverse.
- One shared `<Canvas>` for the whole app. Never mount a second one.
- All motion is critically damped springs, never keyframes, so nothing snaps on a fast flick
  or a reversed scroll.
- Copy and data live in `src/content/*.ts`. Components never hold content.
- DOM colour comes from `src/styles/tokens.css`. The 3D palette is `src/gl/config.ts` — separate
  systems, don't cross them.

## 2. Plan

At most 8 bullets: goal, files, interaction approach, performance, risks. Then implement
immediately. Only ask if something is genuinely ambiguous or risks destroying work.

## 3. Implement

That phase only. Don't touch unrelated sections, don't rewrite working code, don't add packages
without a reason recorded in PLAN.md. Prefer subtraction over addition.

Missing data becomes a typed placeholder marked `// TODO`. Never invent achievements, projects
or qualities — the site is about a real person.

## 4. Test

`npm run typecheck && npm run build`, then check the dev console. Verify at 375 / 768 / 1440px.
Fix what this phase introduced; leave pre-existing issues alone unless the phase is about them.

Also confirm, when the phase touched them:

- Reduced motion: the canvas is never mounted; `src/gl/SkyFallback.tsx` stands in.
- The site still reads as intentional with 3D disabled.
- Keyboard navigation and visible focus survive.

Note that `npm` is not on this machine's PATH — prepend `C:\Program Files\nodejs` when a shell
can't find it.

## 5. Report

Four headings, nothing else. No tutorials, no restating the requirements.

```
IMPLEMENTED   3–5 bullets
FILES         paths touched
TESTED        what you actually ran and checked
ISSUES        unresolved only — omit the heading if there are none
```

## 6. Commit

One commit at the end of the phase: `feat(phase-X): <summary>`.

Don't commit `Claude outputs/` or another session's uncommitted work — check `git status`
and stage only the files this phase changed.
