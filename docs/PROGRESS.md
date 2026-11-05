# Progress

## M1 — core and fixtures: DONE (2026-11-05)
- `src/core`: model (Zod), quantities, dates, seeded RNG, resolve, plates, frequency, checker, dish fit,
  variety engine, planner (bounded DFS under frequency rules, explained infeasibility), batches, shopping
  aggregation + reconciliation, validator (six acceptance dishes), consumed-aware mutations, household + migrations.
- `src/data`: foods catalogue (~150 incl. veg/condiments), demo plan (invented values), seed book (47 dishes incl. 2 drafts).
- `plans/demo.json` committed; `plans/private/giulia.json` generated locally (ignored).
- Tests: 99 passing (property tests over seeds, plates invariants, 900/100/500 reconciliation, verdicts, coverage of every option combination).
- CLI: `pnpm week demo|private [seed]` prints a week, rules and the list.

## Next: M2 — the app on one phone
Store layer (Dexie, outbox, export/import) → design tokens → Tonight / Week / Shopping / Recipes / Settings → PWA → Playwright journey + screenshots.
