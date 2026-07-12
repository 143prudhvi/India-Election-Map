import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import StateYearPicker from '../components/StateYearPicker.jsx';
import ColorModeToggle from '../components/ColorModeToggle.jsx';
import ViewToggle from '../components/ViewToggle.jsx';
import MapChoropleth from '../components/MapChoropleth.jsx';
import SeatDonut from '../components/SeatDonut.jsx';
import PartyLegend from '../components/PartyLegend.jsx';
import ConstituencyPanel from '../components/ConstituencyPanel.jsx';
import PartyChip from '../components/PartyChip.jsx';

const FALLBACK_COLOR = '#9e9e9e';
const DEFAULT_STATE = 'delhi';

function latestYear(years) {
  return Math.max(...years);
}

export default function Explorer() {
  const [searchParams, setSearchParams] = useSearchParams();

  const statesReq = useApi('/api/data/states', { cached: true });
  const partiesReq = useApi('/api/data/parties', { cached: true });
  const states = statesReq.data;
  const parties = partiesReq.data;

  const partyMap = useMemo(() => {
    const map = new Map();
    (parties || []).forEach((p) => map.set(p.code, p));
    return map;
  }, [parties]);

  const partyColor = useCallback(
    (code) => partyMap.get(code)?.color || FALLBACK_COLOR,
    [partyMap]
  );

  const partyName = useCallback(
    (code) => partyMap.get(code)?.name || code,
    [partyMap]
  );

  // Resolve state/year from the URL query, falling back to delhi + latest year.
  const selection = useMemo(() => {
    if (!states) return null;
    const wantSlug = searchParams.get('state');
    const wantYear = Number(searchParams.get('year'));
    let st = states.find((s) => s.slug === wantSlug && s.years.length > 0);
    if (!st) st = states.find((s) => s.slug === DEFAULT_STATE && s.years.length > 0);
    if (!st) st = states.find((s) => s.years.length > 0);
    if (!st) return null;
    const year = st.years.includes(wantYear) ? wantYear : latestYear(st.years);
    return { slug: st.slug, year, state: st };
  }, [states, searchParams]);

  const wantAlliances = searchParams.get('view') === 'alliances';

  function paramsFor(slug, year, alliances = wantAlliances) {
    const p = { state: slug, year: String(year) };
    if (alliances) p.view = 'alliances';
    return p;
  }

  // Keep the URL in sync so refresh/deep-link restores the view.
  useEffect(() => {
    if (!selection) return;
    if (
      searchParams.get('state') !== selection.slug ||
      searchParams.get('year') !== String(selection.year)
    ) {
      setSearchParams(paramsFor(selection.slug, selection.year), { replace: true });
    }
  }, [selection, searchParams, setSearchParams]);

  const [colorMode, setColorMode] = useState('winner'); // 'winner' | party/alliance code
  const [selectedAc, setSelectedAc] = useState(null); // {acNo, acName} | null

  // Selection can also change through browser back/forward (URL-driven), not
  // just the picker handlers — drop a stale constituency selection either way.
  useEffect(() => {
    setSelectedAc(null);
  }, [selection?.slug, selection?.year]);

  const boundaryReq = useApi(
    selection ? `/api/data/${selection.slug}/boundary` : null,
    { cached: true }
  );
  const resultsReq = useApi(
    selection ? `/api/data/${selection.slug}/${selection.year}/results` : null
  );
  const results = resultsReq.data;

  const resultsByAc = useMemo(() => {
    const map = new Map();
    (results?.constituencies || []).forEach((c) => map.set(c.ac_no, c));
    return map;
  }, [results]);

  const summaryParties = results?.summary?.parties || [];
  const allianceRows = results?.summary?.alliances || [];
  const hasAlliances = allianceRows.length > 0;

  // Alliances exist only where curated (data/raw/alliances.json).
  const view = wantAlliances && hasAlliances ? 'alliances' : 'parties';

  const allianceMeta = useMemo(() => {
    const map = new Map();
    allianceRows.forEach((a) => map.set(a.alliance, a));
    return map;
  }, [allianceRows]);

  // party code -> alliance row (for chips/dots in the constituency panel)
  const allianceOfParty = useMemo(() => {
    const map = new Map();
    allianceRows.forEach((a) => {
      if (a.alliance === 'OTH') return;
      (a.parties || []).forEach((p) => map.set(p.party, a));
    });
    return map;
  }, [allianceRows]);

  // States like UP have 250+ registered parties on the ballot; only ones that
  // won a seat or crossed 1% vote share are worth listing individually.
  const notableParties = useMemo(
    () => summaryParties.filter((p) => p.seats > 0 || p.vote_pct >= 1),
    [summaryParties]
  );
  const minorPartyCount = summaryParties.length - notableParties.length;

  // Rows feeding the donut/legend, shaped identically for both views.
  const groupRows = useMemo(
    () =>
      view === 'alliances'
        ? allianceRows.map((a) => ({ party: a.alliance, seats: a.seats, vote_pct: a.vote_pct }))
        : notableParties,
    [view, allianceRows, notableParties]
  );

  const colorFor = useCallback(
    (code) =>
      view === 'alliances' ? allianceMeta.get(code)?.color || FALLBACK_COLOR : partyColor(code),
    [view, allianceMeta, partyColor]
  );

  // Codes valid as a vote-share color mode (OTH has no alliance_votes entry).
  const shareCodes = useMemo(
    () =>
      view === 'alliances'
        ? allianceRows.filter((a) => a.alliance !== 'OTH').map((a) => ({ party: a.alliance }))
        : notableParties,
    [view, allianceRows, notableParties]
  );

  // If the chosen share-mode code isn't valid in this state/year/view, fall
  // back to winner.
  const effectiveMode =
    colorMode === 'winner' || shareCodes.some((p) => p.party === colorMode)
      ? colorMode
      : 'winner';

  const winnerCodeOf = useCallback(
    (row) => {
      if (!row.winner) return null;
      return view === 'alliances' ? row.winner.alliance ?? 'OTH' : row.winner.party;
    },
    [view]
  );

  const shareOf = useCallback(
    (row, code) => {
      if (view === 'alliances') return row.alliance_votes?.[code] ?? 0;
      const cand = (row.candidates || []).find((c) => c.party === code);
      return cand ? cand.vote_pct : 0;
    },
    [view]
  );

  // Muted extra tooltip line in alliance view: the winner's bloc.
  const winnerTag = useCallback(
    (row) =>
      view === 'alliances' && row.winner
        ? row.winner.alliance ?? 'Unaligned'
        : null,
    [view]
  );

  function handleStateChange(slug) {
    const st = (states || []).find((s) => s.slug === slug);
    if (!st || st.years.length === 0) return;
    setSelectedAc(null);
    setColorMode('winner');
    setSearchParams(paramsFor(slug, latestYear(st.years)));
  }

  function handleYearChange(year) {
    if (!selection) return;
    setSelectedAc(null);
    setColorMode('winner');
    setSearchParams(paramsFor(selection.slug, year));
  }

  function handleViewChange(next) {
    if (!selection) return;
    setColorMode('winner');
    setSearchParams(paramsFor(selection.slug, selection.year, next === 'alliances'), {
      replace: true,
    });
  }

  function handleSelectAc(ac) {
    setSelectedAc(ac); // {acNo, acName} or null (background click)
  }

  // --- top-level loading / error states -------------------------------------
  if (statesReq.loading || partiesReq.loading) {
    return (
      <div className="spinner-wrap">
        <div className="spinner" aria-label="Loading election data" />
      </div>
    );
  }

  if (statesReq.error || partiesReq.error) {
    const err = statesReq.error || partiesReq.error;
    return (
      <div className="page">
        <div className="card error-card">
          <h2 className="card-title">Could not load election data</h2>
          <p className="form-error">{err.message}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              statesReq.refetch();
              partiesReq.refetch();
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!selection) {
    return (
      <div className="page">
        <div className="card error-card">
          <h2 className="card-title">No election data available</h2>
          <p>No state in the manifest has any results yet.</p>
        </div>
      </div>
    );
  }

  const selectedResult = selectedAc ? resultsByAc.get(selectedAc.acNo) : null;

  return (
    <div className="explorer">
      <div className="explorer-toolbar">
        <StateYearPicker
          states={states}
          selectedState={selection.slug}
          selectedYear={selection.year}
          onStateChange={handleStateChange}
          onYearChange={handleYearChange}
        />
        {hasAlliances && <ViewToggle view={view} onChange={handleViewChange} />}
        <ColorModeToggle
          mode={effectiveMode}
          parties={shareCodes}
          onChange={setColorMode}
        />
      </div>

      <div className="explorer-body">
        <aside className="explorer-sidebar">
          {selectedAc ? (
            <ConstituencyPanel
              acNo={selectedAc.acNo}
              acName={selectedAc.acName}
              constituency={selectedResult}
              partyColor={partyColor}
              partyName={partyName}
              allianceOfParty={allianceOfParty}
              onClose={() => setSelectedAc(null)}
            />
          ) : (
            <>
              <div className="card sidebar-card">
                <div className="sidebar-headline">
                  <h2 className="sidebar-heading">{selection.state.name}</h2>
                  <span className="year-pill">{selection.year}</span>
                </div>
                <p className="sidebar-subheading">
                  Assembly election · {selection.state.total_seats} seats
                  {view === 'alliances' ? ' · by alliance' : ''}
                </p>
                {resultsReq.loading && (
                  <div className="spinner-wrap">
                    <div className="spinner" aria-label="Loading results" />
                  </div>
                )}
                {resultsReq.error && (
                  <p className="form-error">
                    Could not load results for {selection.state.name}{' '}
                    {selection.year}: {resultsReq.error.message}
                  </p>
                )}
                {results && (
                  <>
                    <SeatDonut
                      parties={groupRows}
                      totalSeats={results.summary.total_seats}
                      partyColor={colorFor}
                    />
                    <PartyLegend
                      mode={effectiveMode}
                      parties={groupRows}
                      partyColor={colorFor}
                      totalSeats={results.summary.total_seats}
                      onPartyClick={(code) => setColorMode(code)}
                      onBack={() => setColorMode('winner')}
                    />
                  </>
                )}
              </div>

              {results && view === 'alliances' && (
                <div className="card sidebar-card">
                  <h3 className="sidebar-heading-sm">Vote share</h3>
                  <table className="summary-table">
                    <thead>
                      <tr>
                        <th>Alliance / party</th>
                        <th className="num">Seats</th>
                        <th className="num">Votes %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allianceRows.map((a) => (
                        <AllianceSummaryRows
                          key={a.alliance}
                          alliance={a}
                          partyColor={partyColor}
                          partyName={partyName}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {results && view === 'parties' && (
                <div className="card sidebar-card">
                  <h3 className="sidebar-heading-sm">Vote share</h3>
                  <table className="summary-table">
                    <thead>
                      <tr>
                        <th>Party</th>
                        <th className="num">Seats</th>
                        <th className="num">Votes %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notableParties.map((p) => (
                        <tr key={p.party}>
                          <td>
                            <PartyChip
                              code={p.party}
                              color={partyColor(p.party)}
                              title={partyMap.get(p.party)?.name || p.party}
                            />
                          </td>
                          <td className="num">{p.seats}</td>
                          <td className="num">{p.vote_pct.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {minorPartyCount > 0 && (
                    <p className="summary-minor-note">
                      + {minorPartyCount} smaller parties under 1% vote share
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </aside>

        <div className="explorer-map">
          {boundaryReq.loading && (
            <div className="spinner-wrap map-overlay">
              <div className="spinner" aria-label="Loading map" />
            </div>
          )}
          {boundaryReq.error && (
            <div className="card error-card map-error">
              <h2 className="card-title">Could not load the map</h2>
              <p className="form-error">{boundaryReq.error.message}</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={boundaryReq.refetch}
              >
                Retry
              </button>
            </div>
          )}
          {boundaryReq.data && (
            <MapChoropleth
              boundary={boundaryReq.data}
              resultsByAc={resultsByAc}
              colorFor={colorFor}
              winnerCodeOf={winnerCodeOf}
              shareOf={shareOf}
              winnerTag={winnerTag}
              colorMode={effectiveMode}
              selectedAc={selectedAc}
              onSelect={handleSelectAc}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function AllianceSummaryRows({ alliance, partyColor, partyName }) {
  return (
    <>
      <tr className="alliance-row">
        <td>
          <span className="alliance-cell">
            <span
              className="legend-swatch"
              style={{ backgroundColor: alliance.color || FALLBACK_COLOR }}
            />
            <span title={alliance.name}>{alliance.alliance}</span>
          </span>
        </td>
        <td className="num">{alliance.seats}</td>
        <td className="num">{alliance.vote_pct.toFixed(2)}%</td>
      </tr>
      {(alliance.parties || []).map((p) => (
        <tr key={p.party} className="member-row">
          <td>
            <PartyChip
              code={p.party}
              color={partyColor(p.party)}
              title={partyName(p.party)}
            />
          </td>
          <td className="num">{p.seats}</td>
          <td className="num">{p.vote_pct.toFixed(2)}%</td>
        </tr>
      ))}
    </>
  );
}
