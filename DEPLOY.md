# Putting AutoPak on Vercel

> **Already deployed.** Live at <https://autopak-vercel.vercel.app> — the
> dashboard at `/`, the standalone compiler at `/compiler`. Project name on
> Vercel is `autopak-vercel`. To publish a change, see
> [Every update after that](#every-update-after-that); the routes below are kept
> for reference and for standing the site up somewhere else.

Both tools are pure client-side HTML — pdf-lib stamps and merges in the browser,
and no cutsheet ever leaves the machine. So there is nothing to build and no
server to run. This is a **static deploy**: Vercel just hands out two HTML files.

The files that make this folder a Vercel project are already here:

| File | Why it's here |
|---|---|
| `vercel.json` | `/compiler` shortcut, CSP, and `noindex` + hardening headers |
| `.vercelignore` | Keeps cutsheets, compiled packages, registry backups and the Python port out of the upload |
| `robots.txt` | Second belt on top of the `X-Robots-Tag` header |

What should end up published, about 310 KB: `index.html`,
`package-compiler.html`, `vercel.json`, `robots.txt`. **No PDFs, no
`Cutsheets/`, no `Archive/`, no Python — and not these two markdown files
either**: they name local paths and say out loud that the URL is unprotected,
neither of which needs to sit on a public host.

---

## Pick a route

| | Install needed | Same URL every time | Use it for |
|---|---|---|---|
| **A — CLI** | Node + `vercel` | **Yes** | The real deployment |
| **B — Git** | Git account | **Yes** | Auto-deploy on every push |
| **C — Drop** | Nothing | **No — new URL each time** | A 2-minute look, once |

**Route A is the one to use.** The reason is specific to AutoPak: the registry
lives in `localStorage`, which browsers scope **per origin**. Every project gets
its own URL, so a changing URL means a vanishing registry. Route C creates a
brand-new project on every upload, which means a new URL, which means everyone's
project records disappear. Fine to look at, wrong to live on.

---

## Route A — Vercel CLI (recommended)

**Step 1 — check you have Node.** In PowerShell:

```powershell
node -v
```

A version number means you're set. "not recognized" means install Node LTS from
<https://nodejs.org> first, then reopen PowerShell.

**Step 2 — install the CLI and sign in.**

```powershell
npm i -g vercel
vercel login
```

`vercel login` opens a browser. Sign in (GitHub, GitLab, Bitbucket, or email) and
come back to the terminal.

**Step 3 — deploy from this folder.**

```powershell
cd C:\Users\btumba\Desktop\AutoPak
vercel
```

It asks a short series of questions. Answers:

| Question | Answer |
|---|---|
| Set up and deploy? | **Y** |
| Which scope? | your own account |
| Link to existing project? | **N** |
| Project name? | `autopak-vercel` |
| In which directory is your code located? | `./` |
| Want to modify these settings? | **N** |

On "modify settings" it will have detected **Other** with no build command and no
output directory. That is correct for this project — leave all three empty.

**Step 4 — note the URL.** The first deployment of a new project goes **straight
to production**, so the URL it prints is the real one, something like
`https://autopak-vercel.vercel.app`. Bookmark it and hand *that* URL to the team.

**Step 5 — check the headers landed.**

```powershell
curl.exe -I https://autopak-vercel.vercel.app | Select-String "robots|security"
```

You want to see `x-robots-tag: noindex, nofollow, ...`. If it's missing,
`vercel.json` didn't get uploaded — confirm it's in the folder and redeploy.

**Step 6 — open it and confirm.** Load the URL, add a project, reload, and check
it is still there — that is the registry writing to `localStorage`. Visit
`/compiler` for the standalone tool. Compile a small package to be sure.

For a package with no project record, either use `/compiler` or, in the
dashboard, **+ Package → Standalone** — that mode reads and writes nothing in
the registry.

### Every update after that

```powershell
cd C:\Users\btumba\Desktop\AutoPak
vercel --prod
```

`--prod` is required from the second deployment onward — without it you get a
throwaway preview URL on a different origin, which will look like the registry
has been wiped. Always use `--prod`.

---

## Route B — Git, so it redeploys on every push

The `.gitignore` here already keeps cutsheets and registry backups out of source
control.

```powershell
cd C:\Users\btumba\Desktop\AutoPak
git init
git add .
git commit -m "AutoPak v3 - cutsheet compiler"
git branch -M main
git remote add origin https://github.com/<you>/autopak.git
git push -u origin main
```

Then in Vercel: **Add New → Project → Import** that repo. On the configure
screen set **Framework Preset = Other** and leave Build Command and Output
Directory **empty**. Deploy.

After that, every push to `main` redeploys production; other branches get their
own preview URLs.

> Make the repo **private**. The tools aren't secret, but the history carries the
> studio's page geometry and address block, and a public repo invites someone to
> fork a Mazzetti-branded stamping tool.

---

## Route C — Vercel Drop, no install at all

Only for a quick look. Read the warning first.

> **Do not drag the `AutoPak` folder itself.** Drop uploads from the browser and
> does not apply `.vercelignore`, so you would publish `Cutsheets/` — tens of MB
> of copyrighted manufacturer PDFs, with filenames that name Intel projects, on
> a public URL.

Use the prepared archive instead. It holds exactly four files —
`index.html`, `package-compiler.html`, `vercel.json`, `robots.txt` — sitting at
the **root** of the zip, not inside a folder, so Drop finds `index.html` where it
looks for it and serves the dashboard at `/` rather than at `/autopak/`.

1. Go to <https://vercel.com/drop>.
2. Drag **`autopak-vercel-drop.zip`** (in the AutoPak folder) onto the page.
3. Choose your team and name the project.
4. **Deploy.** It publishes straight to production and gives you a URL.

If Drop asks which page should be the homepage, something is wrong with the
archive — it should find `index.html` on its own. Rebuild rather than picking
from that menu.

Remember: a second drop makes a *second project* at a *different URL*, and the
registry does not follow. Move to Route A before anyone starts entering real
project records.

---

## Three things to know before you send the link round

**1. The registry is per-person.**
On Vercel, records go to the browser's `localStorage`, scoped to the origin
serving the files. Each person's dashboard is their own. The hand-off is
`↓ .json` / `↑ import` on the **Projects** toolbar; `↓ .csv` on the **Issuance
log** gives a flat log for spreadsheets.

Note the dashboard no longer says so on screen — the storage banner was removed
to clean up the header. The **Synced** pill in the toolbar means "the last write
succeeded", not "shared with the team". Worth saying out loud when you hand the
link over.

- **Preview URLs are different origins from production.** A record added on
  `autopak-vercel-git-abc123.vercel.app` is invisible on
  `autopak-vercel.vercel.app`.
- **Clearing site data wipes the registry.** Export before browser cleanup.

If shared records become the point, that's a real backend — Vercel Postgres or
Blob behind an API route, plus auth. A follow-up, not a config change.

**2. Folder linking gets better, not worse.**
"Link folder…" uses the File System Access API, which needs a secure context.
`https://` qualifies, so linking a project's Cutsheets folder and saving
compiled packages back into it both work — in **Chrome or Edge**. Other browsers
fall back to drag-and-drop, exactly as today.

**3. The URL is public unless you pay to protect it.**
`vercel.json` sends `noindex, nofollow` and `robots.txt` disallows crawlers, so
it won't turn up in search — but anyone with the link can open it. Nothing
sensitive is *served*: no cutsheets, no registry data, just the tool. For a login
in front of it, see **Settings → Deployment Protection → Vercel
Authentication**; on the free plan that covers preview deployments only, and
protecting production needs a paid plan.

---

## One runtime dependency

Both tools pull three libraries at load time:

- `pdf-lib@1.17.1` and `@pdf-lib/fontkit@1.1.1` from **unpkg**
- `sortablejs` from **jsDelivr**

Google Fonts supplies the UI typeface. The *stamped* face, Archivo Black, is
base64-embedded in the HTML, so compiled packages never depend on the network.

So the tools need internet at load, and a bad day at unpkg is a bad day for
AutoPak — you'd see *"Could not load the PDF engine."* To remove that: download
those three `.min.js` files into a `vendor/` folder, change the three
`loadScript(...)` URLs in each HTML file to `vendor/…`, and tighten `script-src`
in `vercel.json` to `'self' 'unsafe-inline'`. Worth doing if AutoPak becomes
load-bearing.

---

## Verified before hand-off

This build — `index.html` 188,974 bytes, `package-compiler.html` 110,813 bytes —
was unzipped from `autopak-vercel-drop.zip`, served with the exact headers from
`vercel.json`, and driven end-to-end in Chromium:

- Nothing in the CSP blocks the web fonts, the inline scripts, or the three CDN
  bundles. No console errors, no page errors.
- A project saved, then survived a reload. All three rail sections — Projects,
  Issuance log, Luminaire types — render.
- `/compiler` resolves to the standalone tool.
- Staged `P3_OCL_CQ1_LED.pdf`, `S8-S SERIES_Finelite_HP6_Surface-Mount.pdf` and
  `S9_Finelite_S11MP.pdf` → tags read **P3**, **S8-S SERIES**, **S9**.
- Generated `20260812 - Intel SC9 - Permit Set - Luminaire Cutsheets.pdf`:
  18 Letter pages; cover reading INTEL SC9 / SANTA CLARA, CA / LIGHTING AND
  CONTROLS UPGRADE / PERMIT SET / AUGUST 12, 2026; the new single footer line
  `Page 1 of 4 · www.mazzetti.com`; four bookmarks with the outline pane set to
  open.
