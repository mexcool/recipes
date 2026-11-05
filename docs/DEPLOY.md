# Deploying Stasera

The app is a static, local-first PWA. It needs no server. The optional sync service lets two phones share
one household; it is a single Cloudflare Worker with a D1 database.

## 1. The app (static)

Any static host works. The build uses relative asset paths and hash-based routing, so it runs from a
sub-path too.

```bash
pnpm install
pnpm exec vite build        # → dist/
```

**GitHub Pages** (workflow included): in the repository settings, Pages → Source → "GitHub Actions".
Pushes to `main`/`master` then publish `dist/` via `.github/workflows/pages.yml`. The app is served at
`https://<user>.github.io/<repo>/`.

**Install on a phone**: open the URL, then "Add to Home Screen" (iOS Safari share menu; Android Chrome
menu). The app works offline after the first visit.

**Move the plan to a second phone without the sync service**: Settings → Export JSON on phone A, send the
file privately, Settings → Import JSON on phone B.

## 2. The sync service (optional)

Requires a Cloudflare account (free tier is enough: 100k requests/day, D1 included).

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create stasera            # copy the database_id into worker/wrangler.toml
pnpm worker:migrate                             # applies worker/migrations to the remote D1
pnpm worker:deploy                              # prints https://stasera-sync.<account>.workers.dev
```

Then on phone A: Settings → Sync between phones → paste the service URL → **Connect this phone**.
Tap **Join on another phone** to show a QR code; scan it with phone B (or send the link privately).
Phone B replaces its own data with the shared household.

Notes:
- The link contains a secret token. Anyone with it can read and change the plan: send it privately and
  use **Rotate link** if it leaks. The service stores only a SHA-256 of the token and never logs it.
- The document is pushed with compare-and-set; if both phones changed the plan while offline, the
  other phone's version wins and the app says so. Shopping ticks are merged individually (last writer wins).
- To point the app at a default service URL at build time, set `VITE_SYNC_URL` in the Pages workflow.

Local development of the service:

```bash
pnpm worker:migrate:local
pnpm worker:dev          # http://localhost:8787 — then connect the dev app to it
```

## 3. The real plan

The repository ships only `plans/demo.json`. The household's real plan is a JSON file of the same shape
(`plans/private/*.json`, git-ignored). Import it on the phone via Settings → **Import a plan file**, then
review the amounts in Settings → Diet plan → **Amounts by day** and mark the revision as reviewed.
