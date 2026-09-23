# Fonts

Self-hosted, declared in `src/styles/fonts.css`, preloaded in `index.html`.

| File | Family | Source | Licence |
|---|---|---|---|
| `BigShouldersDisplay-latin*.woff2` | Big Shoulders Display (variable 100–900) | Google Fonts (`fonts.gstatic.com`, v24) | SIL OFL 1.1 |
| `InterTight-latin*.woff2` | Inter Tight (variable 100–900) | Google Fonts (`fonts.gstatic.com`, v9) | SIL OFL 1.1 |
| `DepartureMono-Regular.woff2` | Departure Mono (pixel mono, 400 only) | departuremono.com | SIL OFL 1.1 |

Both Google families are variable fonts: one file per unicode subset covers every
weight, which is why there is no per-weight file.

**TODO:** Departure Mono is OFL, and the OFL requires the licence text to travel with
the font. The copy on departuremono.com is served without it, so `OFL.txt` should be
pulled from the official download at <https://departuremono.com> and dropped in this
folder before the site ships publicly. Designed by Helena Zhang.
