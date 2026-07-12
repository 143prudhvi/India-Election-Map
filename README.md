# India Election Map

Authenticated web app for exploring Indian state assembly election results as
interactive constituency maps. React (Vite) frontend + Express API + Postgres,
deployed as a single Node service.

The whole app is behind login. There is no self-registration: an admin creates
accounts and hands out temporary passwords, which must be changed at first login.

## Features

- Choropleth of any state's assembly constituencies for any covered election year
  (30 states/UTs, elections from 2010–2024)
- Color by **winner** or by **any party's vote share**
- Click a constituency: zoom in, full candidate table, winner/runner-up/margin
- Party seat summary + semicircle seat donut per state-year
- Admin panel: create users, change roles, reset passwords, delete users
- Profile page: display name + password change

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, D3 v7, react-router 7 (`client/`) |
| API | Express 5, express-session + connect-pg-simple, bcrypt, zod (`server/`) |
| Database | Postgres (users + sessions only — election data is static JSON) |
| Data | Precomputed JSON under `data/` (committed), built by `scripts/` pipeline |

## Getting started

Prereqs: Node ≥ 22, a Postgres database (free [Neon](https://neon.tech) works well;
local Docker Postgres also fine).

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, SESSION_SECRET, ADMIN_EMAIL/PASSWORD
npm run migrate             # creates users + session tables
npm run seed:admin          # creates the first admin (forced password change at first login)
npm run dev                 # API on :10000, Vite dev server on :5173
```

Open **http://localhost:5173** (always use the Vite URL in dev — the session
cookie is set for that origin; don't browse :10000 directly).

## Environment variables

See [.env.example](.env.example). `SESSION_SECRET` and `DATABASE_URL` are
required; the server refuses to boot without them.

## Data model

Election data is **not** in the database. It's committed, pre-computed JSON in
`data/`, served through authenticated API routes:

- `data/states.json` — manifest: slug, name, seats, covered years, map placement
- `data/parties.json` — canonical party registry (code, name, color, name aliases)
- `data/boundaries/<slug>.json` — simplified TopoJSON per state
  (object `constituencies`, properties `{ac_no, ac_name}`)
- `data/results/<slug>/<year>.json` — per-constituency candidates with
  precomputed winner, runner-up, margin, and a party seat/vote summary
- `data/raw/results/<slug>/<year>.json` — raw source results (pipeline input)

### Alliances

Pre-poll alliances are curated by hand in `data/raw/alliances.json`, per state
per year (compositions change every cycle — never assume continuity). Each
entry lists a code, display name, color, and member party codes; single-party
entries are allowed when a major party contested alone. Run
`npm run pipeline` after editing: it stamps each constituency's winner with
its alliance, precomputes per-alliance vote shares and seat summaries, and
prints validation notes (a party in two alliances is a build error; friendly
fights and no-show parties are informational). States/years with alliance
data get a "Parties | Alliances" toggle in the Explorer.

Seeded for 37 elections across 17 states (AP, Assam, Bihar, Chhattisgarh
2018, Goa, J&K, Jharkhand, Kerala, Maharashtra 2019, Nagaland, Puducherry,
Punjab, TN, Telangana, Tripura, UP, WB) — every bloc's seat total verified
against the officially reported outcome. States whose elections had no
meaningful pre-poll alliances (Delhi, Karnataka, MP, Gujarat, ...) are
intentionally absent. Known limitation: alliance-backed independents count
under Others (they share the IND code), so e.g. Kerala LDF shows 84 rather
than the headline 91 for 2016.

### Adding a new election

1. Drop the raw results file at `data/raw/results/<state-slug>/<year>.json`
   (same shape as the existing raw files: array of
   `{ac_no, ac_name, candidates: [{Candidate, Party, "Total Votes", ...}]}`).
2. Run `npm run pipeline`.
3. Review the console report (unknown parties, boundary join mismatches).
   Add any new party to `data/parties.json` (code, color, alias) and re-run.
4. Commit the regenerated files under `data/`.

Boundary sources were one-time inputs and have been removed from the working
tree; they are recoverable from git history (`master` branch,
`public/json/<State>/<State>.json`). Re-run the boundary step with
`node scripts/build-data.js --boundaries` after restoring them if a state's
boundary ever needs to be regenerated.

## Deployment (Render)

[render.yaml](render.yaml) defines the service. Steps:

1. Create a Postgres database (Neon recommended — Render's free Postgres expires
   after 90 days) and note the connection string.
2. Create the Render blueprint from this repo; paste `DATABASE_URL` when asked
   (it's marked `sync: false`).
3. After first deploy, run migrations + seed the admin once from a local shell:
   `DATABASE_URL=... npm run migrate && DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed:admin`
4. Log in with the admin credentials — you'll be forced to change the password
   immediately, which retires the bootstrap secret.

## Password reset (no email)

There is deliberately no SMTP dependency. If a user forgets their password, an
admin uses **Admin → Users → Reset password**, which invalidates the user's
sessions and issues a one-time temporary password shown only once; the user must
change it at next login.

Future enhancement: email-based self-service reset (add a
`password_reset_tokens` table + a mail provider such as Resend). Nothing in the
current schema blocks this.

## History

v1 (2022–2024) was an Express + EJS + D3 v3 app; its views and raw map assets
live in git history on `master` prior to the `rebuild-react-auth` merge.
