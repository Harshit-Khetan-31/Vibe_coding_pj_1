---
name: preflight
description: Pre-ship check for the portfolio — builds, measures the initial JS payload against the 250KB gzipped budget, and verifies the CC BY and OFL licence obligations still hold. Use before deploying to Vercel, before a release commit, or when asked whether the site is ready to ship, whether the bundle is too big, or whether the credits are still in place.
---

# Preflight

Run the checks, then report only what failed and what it costs. A green run is three lines.

`npm` is not on this machine's PATH — prepend `C:\Program Files\nodejs` if a shell can't find it.

## 1. Build clean

```bash
npm run typecheck && npm run lint && npm run build
```

Warnings in the build output count. A chunk-size warning is the budget check talking — read it.

## 2. Payload budget

The documented constraint is **initial JS under 250KB gzipped**, with three.js lazy-loaded.
Measure the real gzipped bytes rather than trusting the build summary:

```bash
node -e "const{readdirSync,readFileSync}=require('fs'),{gzipSync}=require('zlib');\
let t=0;for(const f of readdirSync('dist/assets').filter(f=>f.endsWith('.js'))){\
const g=gzipSync(readFileSync('dist/assets/'+f)).length;t+=g;\
console.log((g/1024).toFixed(1).padStart(8)+' KB gz  '+f)}\
console.log('total '+(t/1024).toFixed(1)+' KB gz')"
```

Total is every chunk; the budget applies to what loads on **first paint**, so attribute the
three.js chunk to the lazy canvas before calling it a failure. If the initial chunks exceed
250KB, say which chunk grew and why rather than proposing a blanket refactor.

The other budgets, if the tooling to measure them is available: LCP under 2.5s, 60fps on a
mid laptop, DPR capped at 1.75.

## 3. Licence obligations

These are conditions, not decoration. The PostToolUse hook checks them on every edit, but
verify before shipping since a build can drop files the hook never saw:

- `plane.glb/license.txt` and the three `public/fonts/*-OFL.txt` files exist.
- The CC BY 4.0 aircraft credit renders in the CONTACT footer — `src/sections/Contact.tsx`
  links `plane.sourceUrl`, `plane.authorUrl` and `plane.licenseUrl`.
- The fonts' OFL text ships with the fonts. Self-hosting woff2 is redistribution, so
  `dist/` must carry them too:

```bash
ls dist/fonts/*OFL* 2>/dev/null || echo "MISSING: OFL text absent from the build output"
```

If that last check fails the site ships non-compliant, even though nothing looks broken.
See FONTS.md for which upstream each licence text came from.

## 4. Report

```
BUILD      pass/fail
PAYLOAD    initial JS KB gz vs the 250KB budget
LICENCES   pass, or exactly what is missing
BLOCKERS   only what must be fixed before deploy — omit if none
```
