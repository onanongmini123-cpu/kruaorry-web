# Fonts (stored in the project)

These fonts are loaded with `next/font/local` in `src/app/layout.tsx`, so building the site
never has to download anything from Google Fonts.

| Family | Used for | Files | License |
|---|---|---|---|
| Anuphan (variable, weights 500–700) | headings (`--font-display`) | `anuphan-thai-variable.woff2`, `anuphan-latin-variable.woff2` | SIL Open Font License 1.1 — `licenses/OFL-Anuphan.txt` (Copyright 2019 The Anuphan Project Authors) |
| IBM Plex Sans Thai (400, 500, 600) | body text (`--font-body`) | `ibm-plex-sans-thai-{thai,latin}-{400,500,600}.woff2` | SIL Open Font License 1.1 — `licenses/OFL-IBM-Plex-Sans-Thai.txt` (Copyright © 2017 IBM Corp.) |
| IBM Plex Mono (400, 500) | reference codes, numbers (`--font-mono`) | `ibm-plex-mono-latin-{400,500}.woff2` | SIL Open Font License 1.1 — `licenses/OFL-IBM-Plex-Mono.txt` (Copyright © 2017 IBM Corp.) |

Source: the woff2 files Google Fonts serves for these families (the `thai` and `latin`
subsets, the same two subsets the site used before). Each file is declared with the same
`unicode-range` Google used for that subset, so the browser picks the same file for the same
characters as before. The license texts must stay with the font files (OFL requires it).
Fonts are not modified. To update, download the newer woff2 files the same way and keep the
file names.
