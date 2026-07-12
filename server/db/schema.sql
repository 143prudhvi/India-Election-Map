CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id                   serial PRIMARY KEY,
  email                citext UNIQUE NOT NULL,
  password_hash        text NOT NULL,
  display_name         text NOT NULL DEFAULT '',
  role                 text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  must_change_password boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Session table used by connect-pg-simple.
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ---------------------------------------------------------------------------
-- Election data. The database is the source of truth (admins edit it in-app);
-- the JSON files under data/ are only the one-time seed (scripts/seed-data.js).
-- Derived values (winner, margin, summaries, alliance stats) are NOT stored —
-- the server computes them from these rows so edits stay consistent.

CREATE TABLE IF NOT EXISTS states (
  slug        text PRIMARY KEY,
  name        text NOT NULL,
  total_seats int NOT NULL DEFAULT 0,
  center      jsonb,
  scale       int,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boundaries (
  slug       text PRIMARY KEY REFERENCES states(slug) ON DELETE CASCADE,
  topojson   jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parties (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  color      text NOT NULL,
  aliases    jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS elections (
  id         serial PRIMARY KEY,
  state_slug text NOT NULL REFERENCES states(slug) ON DELETE CASCADE,
  year       int NOT NULL,
  UNIQUE (state_slug, year)
);

CREATE TABLE IF NOT EXISTS constituencies (
  id          serial PRIMARY KEY,
  election_id int NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  ac_no       int NOT NULL,
  ac_name     text NOT NULL,
  declared    boolean NOT NULL DEFAULT true,
  UNIQUE (election_id, ac_no)
);

CREATE INDEX IF NOT EXISTS idx_constituencies_election ON constituencies(election_id);

-- parties(code) is deliberately RESTRICT-on-delete: a party referenced by any
-- candidate cannot be removed (the admin API surfaces this as a 409).
CREATE TABLE IF NOT EXISTS candidates (
  id              serial PRIMARY KEY,
  constituency_id int NOT NULL REFERENCES constituencies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  party_code      text NOT NULL REFERENCES parties(code),
  votes           int NOT NULL DEFAULT 0 CHECK (votes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_candidates_constituency ON candidates(constituency_id);
CREATE INDEX IF NOT EXISTS idx_candidates_party ON candidates(party_code);

-- Pre-poll alliances, scoped to one election (compositions change per cycle).
CREATE TABLE IF NOT EXISTS alliances (
  id          serial PRIMARY KEY,
  election_id int NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name        text NOT NULL,
  color       text NOT NULL,
  position    int NOT NULL DEFAULT 0,
  UNIQUE (election_id, code)
);

CREATE TABLE IF NOT EXISTS alliance_members (
  alliance_id int NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  party_code  text NOT NULL REFERENCES parties(code),
  PRIMARY KEY (alliance_id, party_code)
);
