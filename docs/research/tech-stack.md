# Tech-stack evaluation — household diet/recipe PWA (as of 4 Nov 2026)

Legend: **[V]** = verified by opening the source in this session. **[S]** = official source surfaced only as a search snippet, or a consistent set of secondary sources (page itself not opened). **[I]** = inference / own estimate. Note: this sandbox could not resolve webkit.org, supabase.com, convex.dev, developers.cloudflare.com, vercel.com, fly.io, powersync.com, firebase.google.com, dexie.org, jazz.tools, zero.rocicorp.dev, tanstack.com, serwist.pages.dev; where possible I used GitHub mirrors of the official docs and the npm registry. Package versions below are `npm view <pkg> version` on 2026-11-04 **[V]**.

## (a) Frontend framework and PWA capability

| Option | Current version [V] | Notes |
|---|---|---|
| Next.js (App Router) | 16.4.5 | Turbopack default. PWA via `@serwist/next` 9.5.13 + `app/manifest.ts`; multiple 2026 guides say Serwist needs the webpack path, not Turbopack **[S]** (friction, not a blocker). Heaviest runtime of the group. |
| SvelteKit | 3.1.1 (Svelte 5.57.3) | 3.0 shipped early Oct 2026: requires Vite 8 (rolldown), config moves into the Vite plugin, `$lib`→`#lib`, `$service-worker`→`$app/service-worker`, remote functions behind `experimental.remoteFunctions` **[V, CHANGELOG]**. `@vite-pwa/sveltekit` 2.0.0 (1 Nov 2026) generates the Workbox SW **[V npm]**. Smallest bundles; built-in service-worker module. |
| TanStack Start (React) | `@tanstack/react-start` 1.169.4 | "1.0 stable" announced 13 Oct 2026 per a secondary source **[S, low]**; README has no status label **[V]**. Best type-safe routing; SSR + server functions; Vite-based so `vite-plugin-pwa` works. Youngest ecosystem. |
| React Router v8 (ex-Remix) | 8.5.1 | v8 released 17 Jun 2026: Node 22.22+, React 19.2.7+, Vite 7+, middleware always on, ESM-only **[S, remix.run blog]**. Remix v2 EOL 17 Jun 2026; "Remix 3" is a separate beta that forks Preact — not a candidate **[S]**. |
| Expo + React Native Web | expo 58.0.23, react-native-web 0.21.4 | SDK 58 = RN 0.88, iOS 27 support **[S expo.dev]**. Only worth it if native is the primary target; RN-Web PWAs are heavier and the SW/offline story is DIY **[I]**. |

**iOS 26 / Safari 26 facts that shape the PWA design**
- Since iOS 26 every site added to the Home Screen opens as a web app by default; installability criteria are gone; the manifest still supplies name/icons/display **[S, WebKit blog "WebKit Features in Safari 26.0"]**.
- No `beforeinstallprompt` on Safari: ship an in-app "Share → Add to Home Screen" instruction card **[S, consistent]**.
- Web Push works only inside an installed Home Screen web app (since 16.4), permission on user gesture; Declarative Web Push since 18.4; Badging API supported (numeric) **[S]**.
- Storage: the 7-day cap on script-writable storage (ITP) exempts the first-party domain of a Home Screen web app **[S — WebKit tracking-prevention page, quoted via secondary sites; webkit.org blocked here]**. Storage-pressure LRU eviction still applies; call `navigator.storage.persist()` (WebKit grants heuristically for Home Screen apps) **[S]**. Background Sync / Periodic Sync are not available on iOS → replay the offline queue on `visibilitychange`/`online`, not from the SW **[I, consistent with secondary]**.
- The installed app shares the SW registration and Cache Storage with Safari, but cookies/localStorage/IndexedDB are isolated **[S, one tester]**. Consequence: a magic link opened from Mail logs the user into Safari, not the installed app. Use **email OTP codes typed in-app** (or passkeys) for the PWA sign-in path **[I]**.
- Plan an SW update UX ("new version — reload"), since the waiting SW only activates once all windows close **[S]**.

**Recommendation:** SvelteKit 3 + Svelte 5, `adapter-cloudflare` (or `adapter-static` + a Worker for API routes), `@vite-pwa/sveltekit` for manifest + Workbox precache + runtime cache. Rationale: smallest JS for a phone-first app, first-class SW module, one or two evening engineers, no RSC/Turbopack complexity. If the team is React-only: TanStack Start on Vite (same PWA plugin), not Next.js.

## (b) Backend / data for a 2-person household with an offline shopping list

| Option | Free tier (as found) | Fit |
|---|---|---|
| Supabase (`@supabase/supabase-js` 2.119.0) | 500 MB DB, 50k MAU, 1 GB storage, 5 GB egress, 2 active projects; **free projects pause after 7 days of inactivity**; Pro $25/mo **[S, consistent across 2026 sources]** | Postgres + RLS + Auth (magic link, OTP, Google) + Realtime in one SDK. The pause rule is the real risk for a weekly-use app (holiday → paused → manual restore). Mitigation: a Cloudflare cron ping every few days **[I]**. |
| Convex 1.49.0 | 1M function calls/mo, 0.5 GB DB, ~1 GB bandwidth, hard caps (mutations fail when exceeded); Pro $25/dev/mo **[S]** | Superb reactivity, but no offline write queue; optimistic updates only **[I]**. Not ideal for in-supermarket use. |
| PocketBase v0.40.6 (23 Oct 2026) **[V GitHub]** | Free, single Go binary + SQLite; release notes say it is "likely the last release on GitHub" (moving hosts) | Needs a VM ($2–5/mo on Fly/Hetzner) and backups; no built-in offline sync. |
| Firebase (Firestore) | Spark: daily Firestore quotas, Auth free; Functions need Blaze **[I, not verified]** | Real offline persistence in the SDK, but lock-in and no SQL for the nutrition math. |
| Cloudflare D1 + Durable Objects | Workers Free: 100k req/day, 10 ms CPU, static assets free and unlimited, 20k asset files; Paid $5/mo **[V, GitHub mirror of CF docs]**. DOs on Free are SQLite-backed only **[S]**. | All-in-one, no pausing; you write auth (Better Auth) and sync yourself. |
| PowerSync (`@powersync/web` 2.6.0) | Free: ~2 GB synced/mo, ~500 MB hosted, 50 concurrent connections; Pro $49/mo **[S, inconsistent]** | Postgres→client SQLite with offline write queue; pairs with Supabase. The "proper" upgrade path if a hand-rolled outbox grows hair. |
| ElectricSQL | Cloud usage-based ($1/M writes), reads free; Apache-2.0 self-host **[S]** | Read-path sync only; writes still DIY. |
| Zero 1.11.4 / Jazz 0.20.19 / Triplit 1.0.50 / TinyBase 10.0.1 / Dexie 4.4.7 | Zero needs a `zero-cache` server + Postgres; Jazz pre-1.0; Triplit cloud status unclear; Dexie Cloud pricing unverifiable **[V versions; S/I status]** | Too much infra or too immature for two users; TinyBase/Dexie are fine as the *client* store. |

**Recommendation (simplest robust):** Supabase Postgres as source of truth (tables: `household`, `member`, `diet_profile`, `recipe`, `ingredient`, `meal_plan`, `shopping_list`, `shopping_item`, all RLS-scoped by `household_id`), Supabase Realtime for live check-offs, and a **client-side IndexedDB store (Dexie 4) with an outbox**: every mutation is written locally first, queued, and replayed on reconnect with last-writer-wins on `updated_at` per `shopping_item`. Check-off conflicts between two phones are benign (idempotent). Weekly plan + list are precached as JSON so the list opens with zero network. Swap the outbox for PowerSync only if conflicts become a problem. Alternative with zero pause risk: Cloudflare D1 + one Durable Object per household + Better Auth — more code, all on one free bill.

## (c) LLM integration (Anthropic) — all **[V, platform.claude.com, 2026-11-04]**

Current lineup (1M context, 128K output, vision, adaptive thinking): `claude-opus-5-5` $4/$20 per MTok (cache read $0.20, default effort `medium`); `claude-sonnet-5-5` $2/$10 (cache read $0.10, default effort `high`); `claude-haiku-5-5` $0.10/$0.50 for prompts ≤100K tokens ($0.50/$2.50 above; cache read $0.01); `claude-fable-5-1` $10/$50 (overkill). Batch API = 50% off everything; batch limit 100k requests or 256 MB, most finish <1 h, results kept 29 days; supports vision, structured outputs, caching. Prompt caching: min cacheable prefix 512 tokens on all 5.5 models, 5-min TTL (refresh free) or 1 h, up to 4 breakpoints, 5-min write = 1.25× input. Structured outputs are GA: `output_config.format = {type:"json_schema", schema}`; TS helper `messages.parse()` + `zodOutputFormat()`; **numeric constraints (`minimum`/`maximum`), `minLength`, recursive schemas are unsupported** (helpers move them into descriptions; validate locally with Zod); grammar compiled on first use and cached 24 h; schema change invalidates the prompt cache; compare enums case-insensitively. `strict: true` on tools gives schema-exact tool inputs. Web fetch server tool is free beyond tokens; web search $10 per 1,000 searches. Vision: ⌈w/28⌉×⌈h/28⌉ visual tokens; 1000×1000 = 1,296 tokens; high-res tier (4.7+) up to 2,576 px long edge / 4,784 tokens; max 10 MB/image; JPEG/PNG/GIF/WebP. Note: effort `low` can lower cost on 5.5 models; thinking cannot be disabled on Opus 5.5.

**Cost per weekly plan [I]:** cached system prompt (diet rules, food-list, preferences) ≈3k tokens; output 7 days × 3–4 meals ≈ 8–12k tokens + a few k thinking. Sonnet 5.5 ≈ $0.10–0.13 sync (≈$0.06 batch); Haiku 5.5 ≈ $0.006; Opus 5.5 ≈ $0.20–0.25. A year of weekly plans plus regenerations (~150 calls) is <$20 on Sonnet. Recipe from photo (2000×1500, ~3.9k tokens) ≈ $0.02 on Sonnet, $0.001 on Haiku. Recipe from URL: first try deterministic schema.org/Recipe JSON-LD extraction (GialloZafferano, Cucchiaio, Fatto in Casa da Benedetta all ship it **[I]**), fall back to readability-to-markdown + Haiku/Sonnet extraction (5–15k tokens ≈ $0.01–0.03 Sonnet).

**Pattern honouring "LLM for creativity, code for numbers":** the model never outputs final gram amounts. Schema: `{meals:[{slot, title_it, title_en, components:[{role:"carb"|"protein"|"fat"|"veg"|"free", food_key, ratio_within_role}], steps[]}]}` where `food_key` must come from the household's canonical food table (enum in schema). Deterministic code then maps `role → prescribed grams`, splits by ratio, rounds to 5 g, computes per-meal totals, aggregates the week into the shopping list with unit conversion tables, and prices it. Haiku 5.5 for parsing/classification, Sonnet 5.5 for weekly generation, Batch API when generating next week overnight.

## (d) Auth for two people

Needs: 2 accounts in 1 household, invite link, Google and passwordless. Supabase Auth: magic link, **email OTP** (same template with `{{ .Token }}`), Google OAuth; passkeys in beta since 28 May 2026, available to all projects, client flag `experimental: { passkey: true }` **[S, Supabase changelog]**. Better Auth 1.7.17: `magic-link`, `email-otp`, `@better-auth/passkey` (SimpleWebAuthn), Google; needs your own DB table set **[S/V]**. Recommendation: Supabase Auth with Google + email OTP (OTP avoids the iOS magic-link-opens-Safari trap); add passkeys once out of beta. Household membership via a `household_member` row created from a signed invite link; RLS on `household_id`.

## (e) Hosting

- Cloudflare Workers: Free 100k req/day, 10 ms CPU, static asset requests free/unlimited, 20k files; Paid $5/mo for 10M req + 30M CPU-ms **[V]**. No egress charges. Cron triggers available (keep-alive ping). Best free fit; CPU limit fine because LLM calls are I/O waits (use `ctx.waitUntil`/streaming; batch jobs via Queues or a cron).
- Vercel Hobby: ~100 GB transfer, ~1M function invocations, non-commercial only **[S, consistent]** — fine for a personal app; Pro $20/seat. Pairs naturally with Next.js only.
- Fly.io: free tier ended for new orgs (Oct 2024); smallest always-on machine ≈ $2/mo plus volume/IPv4 **[S]**. Only needed for PocketBase.

## (f) Native path later

- Capacitor `@capacitor/core` 8.6.0 (28 Oct 2026), 9.0 beta tagged; 8.5 adopted UIScene **[S ionic.io; V npm]**. Wrap the static SvelteKit build (bundle assets locally, do not load a remote URL), add Push, Camera, Badge plugins. Apple guideline 4.2 (verified text): the app must "elevate it beyond a repackaged website"; 4.2.2 bans apps that are primarily "web clippings"; 2.5.6 requires WebKit **[V]**. A meal planner with offline list, camera capture and push is defensible; a thin wrapper is not.
- Android: TWA via Bubblewrap/PWABuilder, `assetlinks.json`, $25 one-time Play fee; Play requires targetSdk 36 for new apps/updates since 31 Aug 2026 and PWABuilder templates lagged **[S, GitHub issue]**. Note: iOS cannot be done via TWA, so Capacitor is the single tool for both stores.
- Expo: only if you rewrite the UI in RN; not a wrapper option.

## (g) i18n Italian/English

`@inlang/paraglide-js` 3.1.0 **[V npm]**: compile-time, tree-shaken, typed message functions, SvelteKit adapter; next-intl 4.14.9 if on Next. Keep food names as canonical keys with `label_it`/`label_en`; ask the model for both titles in one call; `Intl.NumberFormat('it-IT')` for "1,5 kg"; all units metric; `Intl.RelativeTimeFormat` for plan dates. Cheap on-demand translation of user-entered recipes with Haiku.

## (h) Testing and type-safety for the math

Zod 4.6.7 for every boundary (LLM output, Supabase rows, URL/JSON-LD imports). Vitest 5.1.0 + fast-check 4.10.2 property tests on a pure `@app/nutrition` package: integers in grams (no floats); `scale(recipe, targets)` satisfies: role totals equal prescribed grams ±rounding step, scaling is monotone and homogeneous, idempotent on re-scale, no negatives, shopping-list aggregation is order-independent (commutative/associative), unit conversions round-trip; snapshot tests for a few real plans; `pnpm` workspace so the Worker and the client share the schema. Run the LLM in CI only behind a recorded-fixture test; the deterministic layer gets 100% coverage.

## Key findings
- iOS 26 removed installability criteria: any Home Screen-added site opens as a web app by default, which simplifies install UX but Safari still has no install prompt.
- Installed Home Screen web apps are exempt from Safari's 7-day script-writable-storage cap; LRU eviction and no Background Sync still apply, so replay the offline queue on foreground.
- Cookies/IndexedDB are isolated between Safari and the installed app, so use email OTP codes or passkeys instead of magic links for PWA sign-in.
- SvelteKit 3.1.1 (Vite 8) with `@vite-pwa/sveltekit` 2.0.0 is the leanest PWA path; Next.js 16's Turbopack default conflicts with the Serwist webpack plugin per 2026 guides.
- Supabase free is the simplest full backend (Auth+Postgres+RLS+Realtime) but pauses after 7 days idle; a cron ping or the all-Cloudflare alternative avoids that.
- Cloudflare Workers Free (100k req/day, free unlimited static-asset requests, cron triggers) is enough to host the whole app at $0; Paid is $5/mo.
- Sonnet 5.5 ($2/$10) with 512-token-minimum prompt caching and GA structured outputs costs about $0.10 per weekly plan; Haiku 5.5 ($0.10/$0.50) handles parsing for well under a cent.
- Structured outputs reject numeric min/max and recursive schemas, so the gram arithmetic and validation must live in Zod and deterministic code anyway, matching the design principle.
- Batch API gives 50% off for overnight "next week" generation and supports vision, caching and structured outputs.
- Local-first engines (Zero, Jazz, Triplit, Electric) are either immature or need their own server; a Dexie outbox with LWW is sufficient for two users, PowerSync is the upgrade path.
- Capacitor 8.6 wrapping the same static build is the realistic App Store path; Apple 4.2 text targets "repackaged websites", not WebView apps with real utility.
- Google Play requires targetSdk 36 for new apps since 31 Aug 2026; check Bubblewrap/PWABuilder templates before a TWA release.

## Load-bearing claims
- Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 (≤100K prompt), cache reads 0.05× on 5.5 Opus/Sonnet, batch 50% | https://platform.claude.com/docs/en/about-claude/pricing | high (opened)
- Model IDs `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`; 1M context, 128K output, vision on all | https://platform.claude.com/docs/en/models/overview | high (opened)
- Structured outputs GA via `output_config.format`; unsupported min/max, minLength, recursion; 24 h grammar cache | https://platform.claude.com/docs/en/build-with-claude/structured-outputs | high (opened)
- Prompt-cache minimum 512 tokens on 5.5 models; 4 breakpoints; 5-min/1-h TTL | https://platform.claude.com/docs/en/build-with-claude/prompt-caching | high (opened)
- Batch: 100k requests / 256 MB, results 29 days, most <1 h | https://platform.claude.com/docs/en/build-with-claude/batch-processing | high (opened)
- Image tokens = ⌈w/28⌉×⌈h/28⌉, 1000×1000 = 1,296 tokens, 10 MB max | https://platform.claude.com/docs/en/build-with-claude/vision | high (opened)
- Workers Free 100k req/day, 10 ms CPU, static assets free/unlimited, 20k files; Paid $5/mo | https://developers.cloudflare.com/workers/platform/limits/ and /pricing/ (read via raw.githubusercontent.com/cloudflare/cloudflare-docs) | high
- Apple 4.2 "repackaged website" wording; 4.2.2 "web clippings"; 2.5.6 WebKit | https://developer.apple.com/app-store/review/guidelines/ | high (opened)
- SvelteKit 3.0.0 requires Vite 8, `$lib`→`#lib`, `$service-worker` removed | https://github.com/sveltejs/kit/blob/main/packages/kit/CHANGELOG.md | high (opened)
- Package versions (next 16.4.5, kit 3.1.1, react-start 1.169.4, react-router 8.5.1, expo 58.0.23, capacitor 8.6.0, zod 4.6.7, vitest 5.1.0, fast-check 4.10.2, paraglide 3.1.0, better-auth 1.7.17, supabase-js 2.119.0) | https://registry.npmjs.org | high
- PocketBase v0.40.6 (23 Oct), "likely last release on GitHub" | https://github.com/pocketbase/pocketbase/releases/latest | high (opened)
- iOS 26: Home Screen sites open as web apps by default, no installability criteria | https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ | medium (snippet only)
- Home Screen web app first-party domain exempt from 7-day storage cap | https://webkit.org/tracking-prevention/ | medium (host blocked; quoted by secondary sites)
- Web Push only in installed web apps; Declarative Web Push since iOS 18.4 | https://progressivewebapps.com/background/ios-web-push/ | medium
- Supabase Free: 500 MB, 50k MAU, 2 projects, pause after 7 days inactivity; Pro $25 | https://supabase.com/pricing (not opened; e.g. https://uibakery.io/blog/supabase-pricing) | medium
- Supabase passkeys beta 28 May 2026, all projects, `experimental.passkey` | https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta | medium
- Convex Free: 1M calls, 0.5 GB, hard caps | https://docs.convex.dev/production/state/limits | medium
- PowerSync Free ≈2 GB synced/mo, Pro $49 | https://www.powersync.com/pricing | low (sources disagree)
- Vercel Hobby ≈100 GB, 1M invocations, non-commercial | https://vercel.com/docs/limits | medium
- Fly.io no free tier for new orgs; smallest VM ≈$2/mo | https://fly.io/docs/about/pricing/ | medium
- React Router v8 17 Jun 2026; Remix v2 EOL | https://remix.run/blog/react-router-v8 | medium
- TanStack Start 1.0 stable 13 Oct 2026 | https://tech-insider.org/tanstack-start-1-0-stable-release-2026/ | low
- Serwist requires webpack (Next 16 Turbopack default) | https://blog.logrocket.com/nextjs-16-pwa-offline-support/ | low
- Play targetSdk 36 required from 31 Aug 2026 | https://github.com/pwa-builder/pwabuilder/issues/6160 | medium
- Firebase Spark quotas / Functions need Blaze | not opened | low (memory)

## Open questions
- Exact Safari per-origin storage quota on iOS 26 (WebKit 2023 policy post not reachable); irrelevant below ~50 MB but confirm before caching recipe photos offline.
- Does Supabase Realtime traffic count as "activity" that prevents the 7-day pause, or only REST/Auth calls? Determines whether a keep-alive cron is needed.
- Serwist + Next 16: is Turbopack supported in `@serwist/next` 9.5.x now, or still webpack-only? Only matters if the React path is chosen.
- PowerSync and Dexie Cloud current free-tier numbers (pages not reachable); verify before relying on them.
- Whether Supabase email OTP + Google OAuth redirect complete inside an iOS Home Screen web app without bouncing to Safari (needs a device test).
- Supermarket price data source for Sanremo (Coop Liguria, Conad, Carrefour, Esselunga online) — scraping legality and API availability are out of scope here but drive the cost-comparison feature.
- Whether to cap LLM output at `effort: "low"` for Sonnet 5.5 on plan generation; needs a quick eval on variety vs cost.
