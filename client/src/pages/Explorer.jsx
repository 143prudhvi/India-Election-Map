import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../auth/AuthContext.jsx';
import StateYearPicker from '../components/StateYearPicker.jsx';
import ColorModeToggle from '../components/ColorModeToggle.jsx';
import ViewToggle from '../components/ViewToggle.jsx';
import AnalysisControl from '../components/AnalysisControl.jsx';
import AnalysisLegend from '../components/AnalysisLegend.jsx';
import MapChoropleth from '../components/MapChoropleth.jsx';
import SeatDonut from '../components/SeatDonut.jsx';
import PartyLegend from '../components/PartyLegend.jsx';
import ConstituencyPanel from '../components/ConstituencyPanel.jsx';
import ConstituencyHistory from '../components/ConstituencyHistory.jsx';
import WhatIfPanel from '../components/WhatIfPanel.jsx';
import PartyChip from '../components/PartyChip.jsx';
import { shareBandT } from '../lib/shareBands.js';
import { marginColor } from '../lib/marginBands.js';
import { swingColor } from '../lib/swingScale.js';

const FALLBACK_COLOR = '#9e9e9e';
const NO_DATA_FILL = '#e0e0e0';
const DEFAULT_STATE = 'delhi';

function latestYear(years) {
  return Math.max(...years);
}

export default function Explorer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPro = user?.role === 'admin' || user?.tier === 'pro';
  const goUpgrade = useCallback(() => navigate('/upgrade'), [navigate]);
  const mapApiRef = useRef(null);

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
  const [analysis, setAnalysis] = useState(null); // null | 'margin' | {kind:'swing',code,fromYear}
  const [whatIfOpen, setWhatIfOpen] = useState(false);

  // Selection can also change through browser back/forward (URL-driven), not
  // just the picker handlers — drop stale per-view state either way.
  useEffect(() => {
    setSelectedAc(null);
    setAnalysis(null);
    setWhatIfOpen(false);
  }, [selection?.slug, selection?.year]);

  const boundaryReq = useApi(
    selection ? `/api/data/${selection.slug}/boundary` : null,
    { cached: true }
  );
  const resultsReq = useApi(
    selection ? `/api/data/${selection.slug}/${selection.year}/results` : null
  );
  const results = resultsReq.data;

  // Swing mode needs the comparison election's results too.
  const swingFromYear = analysis?.kind === 'swing' ? analysis.fromYear : null;
  const compareReq = useApi(
    selection && swingFromYear != null
      ? `/api/data/${selection.slug}/${swingFromYear}/results`
      : null
  );
  const compareByAc = useMemo(() => {
    const map = new Map();
    (compareReq.data?.constituencies || []).forEach((c) => map.set(c.ac_no, c));
    return map;
  }, [compareReq.data]);

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

  const otherYears = useMemo(
    () => (selection?.state.years || []).filter((y) => y !== selection?.year).sort((a, b) => b - a),
    [selection]
  );

  const swingPartyColor = analysis?.kind === 'swing' ? colorFor(analysis.code) : FALLBACK_COLOR;

  // Ramp for the current share color mode (winner/share views).
  const shareRamp = useMemo(
    () => (effectiveMode === 'winner' ? null : d3.interpolateRgb('#ffffff', colorFor(effectiveMode))),
    [effectiveMode, colorFor]
  );

  // The single fill function handed to the map, derived from the active mode.
  const fillFor = useCallback(
    (acNo) => {
      const row = resultsByAc.get(acNo);
      if (analysis === 'margin') {
        return row?.winner ? marginColor(row.margin_pct) ?? NO_DATA_FILL : NO_DATA_FILL;
      }
      if (analysis?.kind === 'swing') {
        const now = row ? shareOf(row, analysis.code) : 0;
        const prevRow = compareByAc.get(acNo);
        if (!row?.winner || !prevRow) return NO_DATA_FILL;
        const prev = shareOf(prevRow, analysis.code);
        return swingColor(now - prev, swingPartyColor);
      }
      if (effectiveMode === 'winner') {
        const code = row ? winnerCodeOf(row) : null;
        return code ? colorFor(code) : NO_DATA_FILL;
      }
      const t = shareBandT(row ? shareOf(row, effectiveMode) : 0);
      return t == null ? '#ffffff' : shareRamp(t);
    },
    [analysis, resultsByAc, compareByAc, effectiveMode, colorFor, winnerCodeOf, shareOf, shareRamp, swingPartyColor]
  );

  const tooltipExtra = useCallback(
    (row) => {
      const lines = [];
      const tag = winnerTag(row);
      if (tag) lines.push({ text: `Alliance: ${tag}`, muted: true });
      if (analysis?.kind === 'swing') {
        const now = shareOf(row, analysis.code);
        const prevRow = compareByAc.get(row.ac_no);
        const prev = prevRow ? shareOf(prevRow, analysis.code) : null;
        if (prev != null) {
          const d = Math.round((now - prev) * 10) / 10;
          lines.push({
            text: `${analysis.code}: ${prev}% → ${now}% (${d > 0 ? '+' : ''}${d})`,
          });
        } else {
          lines.push({ text: `${analysis.code}: no ${analysis.fromYear} data`, muted: true });
        }
      } else if (row.margin != null) {
        lines.push({
          text: `Margin: ${row.margin.toLocaleString('en-IN')}${row.margin_pct != null ? ` (${row.margin_pct}%)` : ''}`,
          muted: true,
        });
      }
      if (!analysis && effectiveMode !== 'winner') {
        const s = shareOf(row, effectiveMode);
        lines.push({ text: `${effectiveMode}: ${s > 0 ? `${s}%` : 'no votes'}`, muted: true });
      }
      return lines;
    },
    [analysis, effectiveMode, winnerTag, shareOf, compareByAc]
  );

  const baseStroke = analysis || effectiveMode !== 'winner' ? '#c9c9c9' : '#ffffff';

  async function handleExportPng() {
    if (!mapApiRef.current) return;
    try {
      const blob = await mapApiRef.current.exportPng(2);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selection.slug}-${selection.year}-map.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* map not ready — ignore */
    }
  }

  function handleAnalysisChange(next) {
    setAnalysis(next);
    if (next) setWhatIfOpen(false);
  }

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
        {!analysis && (
          <ColorModeToggle
            mode={effectiveMode}
            parties={shareCodes}
            onChange={setColorMode}
          />
        )}
        <div className="toolbar-actions">
          <AnalysisControl
            analysis={analysis}
            parties={shareCodes}
            otherYears={otherYears}
            isPro={isPro}
            onChange={handleAnalysisChange}
            onUpgrade={goUpgrade}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (!isPro) return goUpgrade();
              setWhatIfOpen((v) => !v);
              setAnalysis(null);
            }}
            title="Project seats under a uniform swing"
          >
            What-if{!isPro && <span className="pro-tag">PRO</span>}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => (isPro ? handleExportPng() : goUpgrade())}
            title="Download the current map as PNG"
          >
            Export PNG{!isPro && <span className="pro-tag">PRO</span>}
          </button>
        </div>
      </div>

      <div className="explorer-body">
        <aside className="explorer-sidebar">
          {whatIfOpen && results ? (
            <WhatIfPanel
              results={results}
              parties={notableParties}
              partyColor={partyColor}
              partyName={partyName}
              onClose={() => setWhatIfOpen(false)}
            />
          ) : selectedAc ? (
            <>
              <ConstituencyPanel
                acNo={selectedAc.acNo}
                acName={selectedAc.acName}
                constituency={selectedResult}
                partyColor={partyColor}
                partyName={partyName}
                allianceOfParty={allianceOfParty}
                onClose={() => setSelectedAc(null)}
              />
              <div className="card sidebar-card">
                <ConstituencyHistory
                  slug={selection.slug}
                  acNo={selectedAc.acNo}
                  isPro={isPro}
                  partyColor={partyColor}
                  partyName={partyName}
                  onUpgrade={goUpgrade}
                />
              </div>
            </>
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
                    {analysis ? (
                      <AnalysisLegend analysis={analysis} swingPartyColor={swingPartyColor} />
                    ) : (
                      <PartyLegend
                        mode={effectiveMode}
                        parties={groupRows}
                        partyColor={colorFor}
                        totalSeats={results.summary.total_seats}
                        onPartyClick={(code) => setColorMode(code)}
                        onBack={() => setColorMode('winner')}
                      />
                    )}
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
              fillFor={fillFor}
              baseStroke={baseStroke}
              tooltipExtra={tooltipExtra}
              selectedAc={selectedAc}
              onSelect={handleSelectAc}
              svgApiRef={mapApiRef}
            />
          )}
          {analysis?.kind === 'swing' && compareReq.loading && (
            <div className="map-badge">Loading {analysis.fromYear}…</div>
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
