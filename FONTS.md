# Fonts

Self-hosted, declared in `src/styles/fonts.css`, preloaded in `index.html`.

| File | Family | Source | Licence | Licence file |
|---|---|---|---|---|
| `BigShouldersDisplay-latin*.woff2` | Big Shoulders Display (variable 100–900) | Google Fonts (`fonts.gstatic.com`, v24) | SIL OFL 1.1 | `BigShouldersDisplay-OFL.txt` |
| `InterTight-latin*.woff2` | Inter Tight (variable 100–900) | Google Fonts (`fonts.gstatic.com`, v9) | SIL OFL 1.1 | `InterTight-OFL.txt` |
| `DepartureMono-Regular.woff2` | Departure Mono (pixel mono, 400 only) | departuremono.com | SIL OFL 1.1 | `DepartureMono-OFL.txt` |

Both Google families are variable fonts: one file per unicode subset covers every
weight, which is why there is no per-weight file.

## Licence compliance

The OFL requires the licence text to travel with the font whenever the font is
redistributed — and self-hosting `.woff2` files counts as redistribution. The three
`*-OFL.txt` files in `public/fonts/` satisfy that, and are verbatim copies from
upstream:

- Big Shoulders Display — `google/fonts/ofl/bigshouldersdisplay/OFL.txt`
  (Copyright 2019 The Big Shoulders Project Authors)
- Inter Tight — `google/fonts/ofl/intertight/OFL.txt`
  (Copyright 2022 The Inter Project Authors)
- Departure Mono — `rektdeckard/departure-mono/public/assets/LICENSE`
  (Copyright 2022–2024 Helena Zhang). Note the repo's root `LICENSE` is MIT and
  covers the *website*, not the font; the font is OFL.

Do not delete these files when pruning `public/`. They ship with the site by design.
