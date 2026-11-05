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

Requires a Cloudflare account (the free tier is plenty: a phone only talks to the service when it is
opened, comes back online, or something changed; an idle phone makes no requests).

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create stasera            # copy the database_id into worker/wrangler.toml
pnpm worker:migrate                             # applies worker/migrations to the remote D1
pnpm exec wrangler secret put CREATE_KEY        # optional: a setup key, so only you can create households
pnpm worker:deploy                              # prints https://stasera-sync.<account>.workers.dev
```

If you set a `CREATE_KEY`, type it once in Settings → Sync → **Setup key** when connecting the first
phone; joining through a link never needs it.
For extra safety add a Cloudflare rate-limiting rule (Security → WAF) on the worker's hostname; the
service itself caps request bodies and documents.

Then on phone A: Settings → Sync between phones → paste the service URL → **Connect this phone**.
Tap **Join on another phone** to show a QR code; scan it with phone B (or send the link privately).
Phone B replaces its own data with the shared household.

Notes:
- The link contains a secret token. Anyone with it can read and change the plan: send it privately and
  use **Rotate link** if it leaks (the other phone then re-joins with the new link and keeps its unsent
  ticks). The service stores only a SHA-256 of the token; the token travels in a request header, so the
  Workers request logs (method, path, status) never contain it. Backups exported from Settings do not
  contain it either.
- The service is only reachable over https (plain http is accepted for localhost during development).
- The document is pushed with compare-and-set; if both phones changed the plan while apart, the later
  push loses: that phone takes the other version and shows a notice until you dismiss it. Shopping ticks
  are merged individually (last writer wins, by the phones' clocks), so both phones can shop at once.
- A phone running an older app version keeps syncing ticks but can neither overwrite nor read a plan
  saved by a newer version; it shows "Update needed" until updated.
- Documents are capped at 1.5 MB (a household with half a year of weeks is well under 0.5 MB; older weeks
  are pruned automatically).
- To pre-fill the service URL in Settings at build time, add a repository variable `VITE_SYNC_URL`
  (GitHub → Settings → Secrets and variables → Actions → Variables); the Pages workflow passes it to the
  build. CI runs the two-phone journey against a local D1 service on every push.

Local development of the service:

```bash
pnpm worker:migrate:local
pnpm worker:dev          # http://localhost:8787 — then connect the dev app to it
```

## 3. The real plan

The repository ships only `plans/demo.json`. The household's real plan is a JSON file of the same shape
(`plans/private/*.json`, git-ignored). Import it on the phone via Settings → **Import a plan file**, then
review the amounts in Settings → Diet plan → **Amounts by day** and mark the revision as reviewed.
