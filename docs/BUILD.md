# Build brief for the autonomous implementation run

This is the operational brief the implementing agent follows. The product and design decisions are in
[`PLAN.md`](PLAN.md); this file says how the build is run, what "done" means, and what cannot be done
without the owner's credentials.

## Quality bar

End to end, fully tested, beautiful, modern, best practice, great UX. No placeholders, no "TODO later" in
visible UI, no untested arithmetic, no claim that is not verified. The owner is away during the run: make
routine technical and design decisions autonomously, finish the whole product, and report material
limitations precisely and honestly.

## Inputs

- `docs/PLAN.md` and `docs/research/` (in the repo).
- The household's real plan, provided privately to the agent at run time (never in the repo). It is written
  to `plans/private/*.json` (git-ignored) for local tests and is sent to the owner as a JSON file to import
  on the phone. The repo ships only `plans/demo.json`, generic and invented.
- The six starting dishes and their expected verdicts (PLAN.md §6.5).

## Stack (verify exact versions on the npm registry at build time)

| Layer | Choice |
|---|---|
| App | Vite 8, React 19, TypeScript (strict), TanStack Router, Tailwind CSS 4, `vite-plugin-pwa` |
| State / storage | Dexie 4 (IndexedDB), Zod 4 schemas at every boundary, a small store layer over `src/core` |
| Core | `src/core/`: pure TypeScript, no React/DOM/fetch imports (ESLint `no-restricted-imports`), 100 % deterministic with seeds |
| Tests | Vitest + fast-check (properties) + Testing Library (components) + Playwright (phone-sized journeys; Chromium is pre-installed in the build container; if `@playwright/test` is pinned, launch with `executablePath: '/opt/pw-browsers/chromium'`) |
| Lint / format | ESLint 9 flat config, typescript-eslint, Prettier |
| Sync service | `worker/`: Cloudflare Workers + D1 via Wrangler local mode (Miniflare), Hono router, Zod validation; deploy requires the owner |
| CI | GitHub Actions: type check, lint, unit/property tests, build, Playwright journey; a Pages workflow for the static app |

## Repository layout

```
plans/demo.json             generic demo plan (committed)      plans/private/   real plan (ignored)
src/core/                   domain: model, revisions, planner, checker, variety, plates, batches, shopping, validate, migrate
src/data/                   foods catalogue (Italian names, purchase forms, packs, sections), season table, seed dishes
src/store/                  Dexie schema, repositories, outbox, export/import
src/ui/                     routes (Tonight, Week, Shopping, Recipes, Settings), components, design tokens
src/i18n/                   English strings catalogue (Italian toggle later)
worker/                     optional sync service (Workers + D1), its own tests
e2e/                        Playwright phone journeys and screenshots
docs/                       PLAN.md, BUILD.md, research/, screenshots/
.github/workflows/          ci.yml, pages.yml
```

## Design language

Warm cream background, dark readable text, restrained olive accents, generous spacing, food-focused cards;
clear quantities and actions over decoration; system dark mode respected; one typographic scale; 44 px
primary targets; visible focus; reduced-motion variants; real empty, loading, offline and error states.
No image generation or image service is required; use simple iconography.

## Milestones and definition of done

**M1 — core and fixtures.** Types and Zod schemas; demo plan; foods catalogue; `generateWeek` (bounded
search, seeded, explained infeasibility) and `checkWeek` (independent); `resolvePlates`; batches and
allocations; `aggregate` and reconciliation; `validateDish` (context-aware, meal-scope preserving, garnish
rule); migrations with `schemaVersion`. Done when: property tests and the acceptance table in PLAN.md §12
pass on the demo plan and, locally, on the private plan; a CLI prints a week and its list.

**M2 — the app on one phone.** All five tabs with every behaviour listed in PLAN.md §7 and §9; the seed
book of ~40 dishes covering every slot combination (drafted with the model at build time, validated by
`validateDish`, reviewed for appeal and plausibility); PWA install and update banner; export/import; the
Playwright journey (setup → generate → lock → replace → add a dish → shop offline → cook view) at 390 × 844
and 360 × 800; screenshots saved to `docs/screenshots/` with generic demo data only. Done when: build,
type check, lint, all tests and the journey pass; no console errors; Lighthouse-style basics (installable,
offline page, contrast) hold.

**M3 — two phones.** `worker/` with D1 schema and endpoints; capability link + QR join; outbox with
operation ids and revisions; conflict surfacing; a two-context Playwright test against Wrangler local mode;
`.github/workflows/pages.yml`; `docs/DEPLOY.md` runbook (one `wrangler login`, one `wrangler deploy`, set
the service URL in Settings). Done when: the two-session sync test passes locally and the app degrades
cleanly with sync unconfigured.

Commit after each milestone with clear messages; push to the working branch. Keep a short `docs/PROGRESS.md`
(what is complete, exact next step, test results) updated at each milestone so an interrupted run can resume.

## Process

- Use parallel agents for independent modules (core sub-modules, screens, worker) with clear file
  ownership, then integrate; run an adversarial code review pass on `src/core` and the sync logic before
  declaring a milestone done; fix what it finds.
- Never ask the owner a question during the run; decide, record the decision in `docs/PROGRESS.md`, move on.
- Re-verify library APIs against installed versions rather than memory; read the package's README or types
  when unsure.
- Add a regression test before fixing any observed calculation or sync bug.

## What requires the owner, and how the build proceeds without it

| Needs the owner | The build does instead |
|---|---|
| Cloudflare login to deploy `worker/` | Builds and tests it in Wrangler local mode; writes the runbook; the app works fully without it |
| Enabling GitHub Pages on the repository | Adds the Pages workflow; documents the one settings step |
| Importing the real plan on the phone | Sends the private plan JSON to the owner; the app has import in Settings |
| Reviewing the draft diet profile | Labels the first revision "draft from the December sheet" until reviewed in Settings |

## Privacy rules (hard)

No nutritionist document content, names, dates or measurements in the repo, fixtures, screenshots, seed
data or commit messages. The private plan file is git-ignored and sent to the owner directly. Screenshots use
the demo plan. Page images for a future import feature are processed in memory only.

## Handoff

A report with: what works and was verified (with the test summary), the screenshots, the private plan JSON,
the deploy runbook, and an exact list of anything that remains blocked on the owner, stated as such.
