/**
 * The one place election math lives. Input is normalized rows (from the
 * database or a seed file); output is the exact API response shape the
 * client consumes:
 *
 *   { state, year, summary: { total_seats, parties[], alliances?[] },
 *     constituencies: [{ ac_no, ac_name, declared, winner, runner_up,
 *                        margin, margin_pct, candidates[],
 *                        alliance_votes? }] }
 *
 * Derived values are never stored — recompute here after every edit so
 * winners, margins, summaries and alliance stats can not drift.
 */

const OTH_ALLIANCE = { code: 'OTH', name: 'Others / Unaligned', color: '#9e9e9e' };

export function round2(x) {
  return Math.round(x * 100) / 100;
}

/**
 * @param input {{
 *   state: string, year: number,
 *   constituencies: Array<{ac_no:number, ac_name:string, declared?:boolean,
 *     candidates: Array<{candidate:string, party:string, votes:number}>}>,
 *   alliances?: Array<{code:string, name:string, color:string, parties:string[]}> | null
 * }}
 */
export function computeElection({ state, year, constituencies, alliances = null }) {
  const built = constituencies
    .map((c) => buildConstituency(c))
    .sort((a, b) => a.ac_no - b.ac_no);

  const out = {
    state,
    year,
    summary: buildSummary(built),
    constituencies: built,
  };

  if (Array.isArray(alliances) && alliances.length > 0) {
    applyAlliances(out, alliances);
  }
  return out;
}

function buildConstituency(raw) {
  const totalVotes = raw.candidates.reduce((s, c) => s + (c.votes || 0), 0);

  const candidates = raw.candidates
    .map((c) => ({
      candidate: String(c.candidate ?? '').trim(),
      party: c.party,
      votes: c.votes || 0,
      vote_pct: totalVotes > 0 ? round2(((c.votes || 0) / totalVotes) * 100) : 0,
    }))
    .sort((a, b) => b.votes - a.votes);

  const winner = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;
  const margin = winner && runnerUp ? winner.votes - runnerUp.votes : null;

  return {
    ac_no: raw.ac_no,
    ac_name: String(raw.ac_name ?? '').trim(),
    declared: raw.declared ?? true,
    winner,
    runner_up: runnerUp,
    margin,
    margin_pct: margin != null && totalVotes > 0 ? round2((margin / totalVotes) * 100) : null,
    candidates,
  };
}

function buildSummary(constituencies) {
  const stateTotal = constituencies.reduce(
    (s, c) => s + c.candidates.reduce((t, cand) => t + cand.votes, 0),
    0
  );
  const byParty = new Map();
  const entry = (code) => {
    if (!byParty.has(code)) byParty.set(code, { party: code, seats: 0, votes: 0 });
    return byParty.get(code);
  };
  for (const c of constituencies) {
    if (c.winner) entry(c.winner.party).seats += 1;
    for (const cand of c.candidates) entry(cand.party).votes += cand.votes;
  }
  const parties = [...byParty.values()]
    .map((p) => ({ ...p, vote_pct: stateTotal > 0 ? round2((p.votes / stateTotal) * 100) : 0 }))
    .sort((a, b) => b.seats - a.seats || b.votes - a.votes);

  return { total_seats: constituencies.length, parties };
}

/**
 * Stamp winner.alliance + per-constituency alliance_votes, and add
 * summary.alliances (with an Others/Unaligned bucket). Mutates `out`.
 * Returns {errors, notes} — errors (a party in two blocs) should reject
 * the edit; notes (friendly fights, no-show parties) are informational.
 */
export function applyAlliances(out, defs) {
  const report = { errors: [], notes: [] };
  const where = `${out.state}/${out.year}`;
  const partyToAlliance = new Map();
  for (const a of defs) {
    for (const p of a.parties) {
      if (partyToAlliance.has(p)) {
        report.errors.push(`${where}: party ${p} is in both ${partyToAlliance.get(p)} and ${a.code}`);
      }
      partyToAlliance.set(p, a.code);
    }
  }

  const presentParties = new Set();
  for (const c of out.constituencies) {
    for (const cand of c.candidates) presentParties.add(cand.party);

    if (c.winner) {
      const al = partyToAlliance.get(c.winner.party);
      if (al) c.winner.alliance = al;
      else delete c.winner.alliance;
    }

    const constituencyTotal = c.candidates.reduce((s, cand) => s + cand.votes, 0);
    const votesByAlliance = new Map();
    const contestants = new Map();
    for (const cand of c.candidates) {
      const al = partyToAlliance.get(cand.party);
      if (!al) continue;
      votesByAlliance.set(al, (votesByAlliance.get(al) ?? 0) + cand.votes);
      contestants.set(al, (contestants.get(al) ?? 0) + 1);
    }
    c.alliance_votes = Object.fromEntries(
      defs.map((a) => [
        a.code,
        constituencyTotal > 0
          ? round2(((votesByAlliance.get(a.code) ?? 0) / constituencyTotal) * 100)
          : 0,
      ])
    );
    for (const [al, n] of contestants) {
      if (n > 1) report.notes.push(`${where}: friendly fight in ${c.ac_name} (#${c.ac_no}) — ${n} ${al} candidates`);
    }
  }

  for (const a of defs) {
    for (const p of a.parties) {
      if (!presentParties.has(p)) {
        report.notes.push(`${where}: ${a.code} lists ${p}, but it fielded no candidates`);
      }
    }
  }

  const stateTotal = out.summary.parties.reduce((s, p) => s + p.votes, 0);
  const partyEntry = new Map(out.summary.parties.map((p) => [p.party, p]));
  const allianceRows = defs.map((a) => {
    const members = a.parties
      .map((p) => partyEntry.get(p))
      .filter(Boolean)
      .sort((x, y) => y.seats - x.seats || y.votes - x.votes);
    const seats = members.reduce((s, m) => s + m.seats, 0);
    const votes = members.reduce((s, m) => s + m.votes, 0);
    return {
      alliance: a.code,
      name: a.name,
      color: a.color,
      seats,
      votes,
      vote_pct: stateTotal > 0 ? round2((votes / stateTotal) * 100) : 0,
      parties: members,
    };
  });

  const unaligned = out.summary.parties.filter((p) => !partyToAlliance.has(p.party));
  const othSeats = unaligned.reduce((s, p) => s + p.seats, 0);
  const othVotes = unaligned.reduce((s, p) => s + p.votes, 0);
  if (othVotes > 0 || othSeats > 0) {
    allianceRows.push({
      alliance: OTH_ALLIANCE.code,
      name: OTH_ALLIANCE.name,
      color: OTH_ALLIANCE.color,
      seats: othSeats,
      votes: othVotes,
      vote_pct: stateTotal > 0 ? round2((othVotes / stateTotal) * 100) : 0,
      parties: unaligned.filter((p) => p.seats > 0 || p.vote_pct >= 1),
    });
  }

  out.summary.alliances = allianceRows.sort((a, b) => b.seats - a.seats || b.votes - a.votes);
  return report;
}

/** Raw ECI-shaped rows ({ac_no, ac_name, candidates:[{Candidate, Party, "Total Votes"}]})
 *  -> normalized constituencies, mapping party names to codes via the alias map.
 *  Unknown party names are collected so the caller can auto-register them. */
export function normalizeRawResults(rawRows, aliasToCode) {
  const unknown = new Map(); // raw name -> count
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const parseVotes = (v) => {
    if (v == null) return 0;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const toInt = (v) => {
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? Math.round(n) : NaN;
  };

  const constituencies = rawRows.map((r) => ({
    ac_no: toInt(r.ac_no),
    ac_name: String(r.ac_name ?? '').trim(),
    declared: r.declared ?? true,
    candidates: (Array.isArray(r.candidates) ? r.candidates : []).map((c) => {
      const rawParty = String(c.Party ?? c.party ?? '').trim();
      let party = aliasToCode.get(norm(rawParty));
      if (!party) {
        party = rawParty;
        if (rawParty) unknown.set(rawParty, (unknown.get(rawParty) ?? 0) + 1);
      }
      return {
        candidate: String(c.Candidate ?? c.candidate ?? '').trim(),
        party,
        votes: parseVotes(c['Total Votes'] ?? c.votes),
      };
    }),
  }));

  return { constituencies, unknown };
}
