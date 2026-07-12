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

Election data lives in **Postgres** (states, boundaries, parties, elections,
constituencies, candidates, alliances) and admins edit it in-app under
**Admin → Data**. Derived values — winners, margins, party/alliance summaries,
vote shares — are never stored; the server recomputes them (with caching)
from the base rows, so every edit stays consistent everywhere.

The JSON files under `data/` are the **seed**: on first boot against an empty
database the server loads them automatically (`scripts/seed-data.js`;
`npm run seed:data -- --reset` rebuilds a dev database, discarding in-app
edits). Admin → Data provides Download buttons (parties, alliances,
per-election results in the raw import shape) so you can commit snapshots of
edited data back to git.

- `data/states.json`, `data/parties.json`, `data/boundaries/<slug>.json`,
  `data/raw/results/<slug>/<year>.json`, `data/raw/alliances.json` — seed
  sources (same shapes as before the DB move)

### Alliances

Pre-poll alliances are defined per state per year (compositions change every
cycle — never assume continuity): code, display name, color, member party
codes. Single-party blocs are allowed when a major party contested alone.
Edit them under Admin → Data → Alliances (a party in two blocs is rejected;
seat totals recompute immediately). States/years with alliance data get a
"Parties | Alliances" toggle in the Explorer.

Seeded for 37 elections across 17 states (AP, Assam, Bihar, Chhattisgarh
2018, Goa, J&K, Jharkhand, Kerala, Maharashtra 2019, Nagaland, Puducherry,
Punjab, TN, Telangana, Tripura, UP, WB) — every bloc's seat total verified
against the officially reported outcome. States whose elections had no
meaningful pre-poll alliances (Delhi, Karnataka, MP, Gujarat, ...) are
intentionally absent. Known limitation: alliance-backed independents count
under Others (they share the IND code), so e.g. Kerala LDF shows 84 rather
than the headline 91 for 2016.

### Adding a new election

Use **Admin → Data → Import**: pick the state, enter the year, and upload the
raw results JSON (array of
`{ac_no, ac_name, candidates: [{Candidate, Party, "Total Votes", ...}]}`).
Party names are mapped through the registry's aliases; unknown parties are
auto-registered in grey — give them proper codes/colors in the Parties tab.
Then set the election's alliances (if any) in the Alliances tab.

To keep git in sync, download the imported election from the Results tab and
commit it under `data/raw/results/<state-slug>/<year>.json`.

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
3. Schema migration and the election-data seed run automatically at boot
   (the seed only fires on an empty database, so it never clobbers in-app
   edits). Seed the first admin once from a local shell:
   `DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed:admin`
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
