/**
 * Attributions that have to appear on the page. These are licence obligations,
 * not decoration — anything listed here must be rendered somewhere visible.
 */

export type Credit = {
  what: string
  title: string
  author: string
  authorUrl: string
  sourceUrl: string
  license: string
  licenseUrl: string
}

export const credits: Credit[] = [
  {
    what: 'Aircraft model',
    title: 'Socata ST 10 "Diplomate"',
    author: 'helijah',
    authorUrl: 'https://sketchfab.com/helijah',
    sourceUrl:
      'https://sketchfab.com/3d-models/socata-st-10-diplomate-2c0eba4e3e9545289c50fc739b49a815',
    license: 'CC BY 4.0',
    licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
  },
]

/**
 * Rendered in the CONTACT footer by `src/sections/Contact.tsx` — title links to
 * `sourceUrl`, author to `authorUrl`, licence to `licenseUrl`. CC BY 4.0 requires
 * that credit to stay visible, so do not remove it from the footer. The full
 * statement is kept verbatim in `plane.glb/license.txt`.
 *
 * Other bundled third-party assets and their licence files:
 * - Fonts: `public/fonts/*-OFL.txt` (SIL OFL 1.1) — see `FONTS.md`.
 * - `public/textures/cloud.png`: byte-identical to `pmndrs/drei-assets/cloud.png`
 *   (the @react-three/drei default cloud sprite). That asset repo declares no
 *   licence, so provenance is known but terms are unstated — the one asset here
 *   without an explicit grant.
 */
