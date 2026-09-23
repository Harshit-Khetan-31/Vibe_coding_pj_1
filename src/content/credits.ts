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
 * TODO(phase-6): render this in the CONTACT footer. CC BY 4.0 requires the
 * credit to be visible wherever the work is shared, so the site cannot ship
 * without it. One mono line is enough, e.g.:
 *
 *   Socata ST 10 "Diplomate" by helijah — CC BY 4.0
 *
 * with the title linking to `sourceUrl`, the author to `authorUrl` and the
 * licence to `licenseUrl`. The full statement is kept verbatim in
 * `plane.glb/license.txt`.
 */
