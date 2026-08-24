# AutoPak Cutsheet Compiler

Mazzetti Lighting Design Studio. Client-side tools for compiling luminaire
cutsheet packages — read, stamped and merged **entirely in the browser**,
nothing is uploaded to any server.

| File | What it is |
|---|---|
| `index.html` | Registry dashboard: project records, issuance log with a month calendar, luminaire type library, and the compiler |
| `package-compiler.html` | Standalone compiler — drag PDFs in, no project record needed |
| `compile_package.py` | Command-line port, for batch or scheduled runs (`pip install pypdf reportlab`) |
| `mz_design.py` | Cover and stamp geometry for the Python port. **Must sit next to `compile_package.py`** |
| `mz_wordmark.pdf` | The square-M wordmark as vector art. **Must sit next to `compile_package.py`** |
| `mz_wordmark.svg` | The same mark for the tools' own UI (already inlined in both HTML files) |
| `ArchivoBlack.ttf` | Display face (SIL OFL). **Must sit next to `compile_package.py`** |

Both HTML files are self-contained — the typeface and the logo are embedded in
them, so they work opened straight from disk with no install step.

## Output

`YYYYMMDD - Project Name - Issuance Description - Luminaire Cutsheets.pdf`

Letter pages, one bookmark per fixture, bookmark pane open on launch.

**Cover** — centred, all caps: project name, project location, optional
subtitle, issuance description, issuance date, abbreviation, then the Mazzetti
lockup.

**Every sheet** — a header band at the top carrying the logo (left), the
project name over `ISSUANCE / MM.DD.YY` (centre), and the luminaire type in a
box (right) labelled *LUMINAIRE TYPE*, closed by a rule. A footer band under a
matching rule carries `www.mazzetti.com` on the left and `Page X of Y` on the
right, numbered per fixture rather than across the package.

Cutsheets are scaled to fit a 540 × 684.98 pt box — 0.5" left and right, from
the header rule down to the footer rule.

## Design

Cover and stamp follow the reference pages of 2026-08-10. Coordinates were read
out of that PDF's own content streams rather than measured off a render, so the
browser tools and the Python port land on the same numbers — verified at 200 dpi
to within 0.01% of pixels, which is antialiasing.

Display type is **Archivo Black**, an open-licence face whose advance widths are
identical to the Arial Black the reference is set in. It is embedded and subset
into every package, so files render the same on machines that don't have it
installed. The Mazzetti lockup is vector — the wordmark is real artwork, the
LIGHTING DESIGN STUDIO line is typeset beneath it — so it stays sharp at any
zoom or print size.

## Luminaire type tags

The stamped type is everything up to the first underscore. Spaces and dashes
are kept, so sensor variants and series qualifiers both survive:

- `P1_Finelite_HP4_Circle_2FT DIA.pdf` → **P1**
- `R1-S_Finelite_HPRLED_2x4.pdf` → **R1-S**
- `S8-S SERIES_Finelite_HP6_Surface-Mount.pdf` → **S8-S SERIES**

A type may carry one ALL-CAPS qualifier after a space. In the box on each
sheet the qualifier is set on a second line under the type, so the type itself
stays large. The qualifier is matched case-sensitively, which is what keeps a
space-separated name like `P1 Finelite HP4.pdf` from being read as a type.

When reading a folder, only files whose first word looks like a luminaire type
are taken. Binders, permit sets, comparison guides and control-equipment
cutsheets are listed as skipped rather than silently dropped.

## Requirements

- Chrome or Edge for folder linking (File System Access API). Other browsers
  fall back to drag-and-drop.
- The dashboard remembers one cutsheets folder per project. The path is stored
  on the project record for reference; the folder itself is chosen once through
  the browser picker, since a browser cannot open a path from a string.

## Registry storage

Records persist in the browser's `localStorage`, scoped to whatever origin
serves these files. That means **per person, per browser — not shared across
the team.** Use `↓ .json` / `↑ import` on the *Projects* toolbar to hand a
registry to someone else or move it between machines; `↓ .csv` on the
*Issuance log* gives a flat log for spreadsheets and reporting.

A package can also be compiled with no project record at all — *+ Package →
Standalone*. Nothing is read from or written to the registry in that mode; it
is for one-offs and for someone else's project.

## Note

`helvetica_kerning.json` was no longer used and has been removed, along with
the rest of the legacy `Archive/` folder.
