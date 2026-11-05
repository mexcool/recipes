# Progress

## M1 — core and fixtures: DONE
- `src/core`: model (Zod), quantities, dates, seeded RNG, resolve, plates, frequency, checker, dish fit,
  variety engine, planner (bounded DFS under frequency rules, explained infeasibility, kept meals, joint
  grain-and-dish choice), batches (deliberate cooked-once leftovers), shopping aggregation + reconciliation,
  validator (six acceptance dishes), consumed-aware mutations, household + migrations.
- Two adversarial reviews applied (numbers/rules; planner/mutations/time-awareness).
- `src/data`: foods catalogue, demo plan (invented values), seed book of 49 dishes incl. 2 drafts.

## M2 — the app on one phone: DONE
- Store (Dexie, immediate serialized writes), selectors, actions; React 19 + TanStack Router (hash history).
- Screens: Tonight (with tomorrow's lunchbox and the meal sheet), Cook, Week (+ MealSheet), Shopping,
  Recipes (list, detail with verdict card, editor with live verdict), Settings, Plan amounts, Join.
- PWA (manifest, icons, precache, update banner), design tokens with dark mode, accessibility bar.
- Playwright: smoke + full phone journey (plan → lock/replace → add a dish → shop offline → cook).

## M3 — two phones: DONE (service not deployed: needs the owner's Cloudflare login)
- `worker/`: Hono + D1 (compare-and-set document, idempotent check ops with conflict surfacing, token rotation),
  unit tests on the in-memory store, verified end-to-end against Wrangler local D1.
- Client sync layer: outbox, dirty flag, push/pull/merge, join link + QR, Settings controls.
- CI workflow (typecheck, lint, unit, build, e2e) and GitHub Pages workflow.

## Final adversarial reviews (UI/accessibility; sync/security): APPLIED
- Dish titles follow the food chosen for the meal (`{{role}}` placeholders in titles).
- Sync: no self-polling (an idle phone makes no requests), ticks never dirty the document, unchecks
  leave tombstones, sticky "changed elsewhere" notice, schema guard (426), token never exported, join
  link stripped from history, https required, rejected ops never block the queue, full-UUID op ids.
- Service: per-household op ids and atomic sequence numbers (migration 0002, verified with 40 parallel
  pushes on local D1), input validation with 400s, body limits, byte-measured document cap, optional
  `CREATE_KEY`, pruning of old operations. CI runs the two-phone journey against local D1.
- UI: see the commit "UI review fixes" (weekend planning, eating-out reversible, dark-mode contrast,
  modal sheets, clock-aware hero, readable plate chips, editor reasons, link-as-button markup).
- Known, not done: ~90 UI strings still live outside `src/i18n/en.ts` (Italian UI is a later step).

## Next
- Owner: deploy the worker (docs/DEPLOY.md), enable Pages, import the real plan, review amounts.
- v1.1: "New idea" with the model; recipe text/URL parsing. v1.2: photo/PDF plan import.
