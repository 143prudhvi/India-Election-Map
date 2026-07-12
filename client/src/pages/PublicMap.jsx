import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import StateYearPicker from '../components/StateYearPicker.jsx';
import ColorModeToggle from '../components/ColorModeToggle.jsx';
import ViewToggle from '../components/ViewToggle.jsx';
import MapChoropleth from '../components/MapChoropleth.jsx';
import SeatDonut from '../components/SeatDonut.jsx';
import PartyLegend from '../components/PartyLegend.jsx';
import ConstituencyPanel from '../components/ConstituencyPanel.jsx';
import ShareButton from '../components/ShareButton.jsx';
import { makeBasicFill, FALLBACK } from '../lib/basicFill.js';
import { shortPartyLabel } from '../lib/partyLabel.js';
import { displayName } from '../lib/formatName.js';

const DEFAULT_STATE = 'delhi';
const latest = (years) => Math.max(...years);

// Public, read-only map (no login). Only reachable when the server has
// PUBLIC_ACCESS_ENABLED=true; otherwise the data calls 403 and we show a notice.
export default function PublicMap({ embed = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const statesReq = useApi('/api/public/states', { cached: true });
  const partiesReq = useApi('/api/public/parties', { cached: true });
  const states = statesReq.data;
  const parties = partiesReq.data;

  const partyMap = useMemo(() => {
    const m = new Map();
    (parties || []).forEach((p) => m.set(p.code, p));
    return m;
  }, [parties]);
  const partyColor = useCallback((c) => partyMap.get(c)?.color || FALLBACK, [partyMap]);
  const partyName = useCallback((c) => partyMap.get(c)?.name || c, [partyMap]);

  const selection = useMemo(() => {
    if (!states) return null;
    const wantSlug = searchParams.get('state');
    const wantYear = Number(searchParams.get('year'));
    let st = states.find((s) => s.slug === wantSlug && s.years.length > 0);
    if (!st) st = states.find((s) => s.slug === DEFAULT_STATE && s.years.length > 0);
    if (!st) st = states.find((s) => s.years.length > 0);
    if (!st) return null;
    const year = st.years.includes(wantYear) ? wantYear : latest(st.years);
    return { slug: st.slug, year, state: st };
  }, [states, searchParams]);

  const wantAlliances = searchParams.get('view') === 'alliances';
  const [colorMode, setColorMode] = useState('winner');
  const [selectedAc, setSelectedAc] = useState(null);

  const boundaryReq = useApi(selection ? `/api/public/${selection.slug}/boundary` : null, {
    cached: true,
  });
  const resultsReq = useApi(
    selection ? `/api/public/${selection.slug}/${selection.year}/results` : null
  );
  const results = resultsReq.data;

  const resultsByAc = useMemo(() => {
    const m = new Map();
    (results?.constituencies || []).forEach((c) => m.set(c.ac_no, c));
    return m;
  }, [results]);

  const allianceRows = results?.summary?.alliances || [];
  const hasAlliances = allianceRows.length > 0;
  const view = wantAlliances && hasAlliances ? 'alliances' : 'parties';

  const allianceMeta = useMemo(() => {
    const m = new Map();
    allianceRows.forEach((a) => m.set(a.alliance, a));
    return m;
  }, [allianceRows]);
  const colorFor = useCallback(
    (code) => (view === 'alliances' ? allianceMeta.get(code)?.color || FALLBACK : partyColor(code)),
    [view, allianceMeta, partyColor]
  );

  const summaryParties = results?.summary?.parties || [];
  const notable = useMemo(
    () => summaryParties.filter((p) => p.seats > 0 || p.vote_pct >= 1),
    [summaryParties]
  );
  const groupRows = useMemo(
    () =>
      view === 'alliances'
        ? allianceRows.map((a) => ({ party: a.alliance, seats: a.seats, vote_pct: a.vote_pct }))
        : notable,
    [view, allianceRows, notable]
  );
  const shareCodes = view === 'alliances' ? allianceRows.filter((a) => a.alliance !== 'OTH').map((a) => ({ party: a.alliance })) : notable;
  const effectiveMode = colorMode === 'winner' || shareCodes.some((p) => p.party === colorMode) ? colorMode : 'winner';

  const { fillFor, shareOf } = useMemo(
    () => makeBasicFill({ view, colorMode: effectiveMode, resultsByAc, colorFor }),
    [view, effectiveMode, resultsByAc, colorFor]
  );

  const tooltipExtra = useCallback(
    (row) => {
      const lines = [];
      if (view === 'alliances' && row.winner?.alliance) {
        lines.push({ text: `Alliance: ${row.winner.alliance}`, muted: true });
      }
      if (row.margin != null) {
        lines.push({ text: `Margin: ${row.margin.toLocaleString('en-IN')}${row.margin_pct != null ? ` (${row.margin_pct}%)` : ''}`, muted: true });
      }
      if (effectiveMode !== 'winner') {
        const s = shareOf(row, effectiveMode);
        lines.push({ text: `${effectiveMode}: ${s > 0 ? `${s}%` : 'no votes'}`, muted: true });
      }
      return lines;
    },
    [view, effectiveMode, shareOf]
  );

  function setParams(next) {
    const p = { state: next.slug, year: String(next.year) };
    if (next.view === 'alliances') p.view = 'alliances';
    setSearchParams(p);
    setSelectedAc(null);
  }

  if (statesReq.error || partiesReq.error) {
    const disabled = (statesReq.error || partiesReq.error)?.code === 'PUBLIC_DISABLED';
    return (
      <div className="page-center">
        <div className="card error-card">
          <h2 className="card-title">{disabled ? 'Public access is off' : 'Could not load data'}</h2>
          <p className="card-hint">
            {disabled
              ? 'This map is not publicly available. Please sign in to explore election data.'
              : (statesReq.error || partiesReq.error).message}
          </p>
          <Link className="btn btn-primary" to="/login">Sign in</Link>
        </div>
      </div>
    );
  }

  if (statesReq.loading || partiesReq.loading || !selection) {
    return (
      <div className="spinner-wrap spinner-page">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  const selectedResult = selectedAc ? resultsByAc.get(selectedAc.acNo) : null;
  const shareParams = { state: selection.slug, year: String(selection.year), ...(view === 'alliances' ? { view: 'alliances' } : {}) };

  const map = boundaryReq.data && (
    <MapChoropleth
      boundary={boundaryReq.data}
      resultsByAc={resultsByAc}
      fillFor={fillFor}
      baseStroke={effectiveMode === 'winner' ? '#ffffff' : '#c9c9c9'}
      tooltipExtra={tooltipExtra}
      selectedAc={selectedAc}
      onSelect={setSelectedAc}
    />
  );

  // Embed mode: bare map + a compact caption, no chrome (for iframes).
  if (embed) {
    return (
      <div className="embed-wrap">
        <div className="embed-map">{map}</div>
        <div className="embed-caption">
          <span>{selection.state.name} {selection.year}</span>
          <a href={`${window.location.origin}/m?${new URLSearchParams(shareParams)}`} target="_blank" rel="noreferrer">
            India Election Map ↗
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="brand-mark"><span /><span /><span /></span>
          <span className="app-title">India Election Map</span>
        </div>
        <div className="app-header-right">
          <span className="public-badge">Public preview</span>
          <Link className="btn btn-secondary btn-sm" to="/login">Sign in</Link>
        </div>
      </header>
      <main className="app-main">
        <div className="explorer">
          <div className="explorer-toolbar">
            <StateYearPicker
              states={states}
              selectedState={selection.slug}
              selectedYear={selection.year}
              onStateChange={(slug) => {
                const st = states.find((s) => s.slug === slug);
                if (st?.years.length) setParams({ slug, year: latest(st.years), view });
              }}
              onYearChange={(year) => setParams({ slug: selection.slug, year, view })}
            />
            {hasAlliances && (
              <ViewToggle
                view={view}
                onChange={(next) => setParams({ slug: selection.slug, year: selection.year, view: next })}
              />
            )}
            {!selectedAc && (
              <ColorModeToggle mode={effectiveMode} parties={shareCodes} onChange={setColorMode} />
            )}
            <div className="toolbar-actions">
              <ShareButton params={shareParams} />
            </div>
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
                  allianceOfParty={new Map()}
                  onClose={() => setSelectedAc(null)}
                />
              ) : (
                <div className="card sidebar-card">
                  <div className="sidebar-headline">
                    <h2 className="sidebar-heading">{selection.state.name}</h2>
                    <span className="year-pill">{selection.year}</span>
                  </div>
                  <p className="sidebar-subheading">
                    Assembly election · {selection.state.total_seats} seats
                    {view === 'alliances' ? ' · by alliance' : ''}
                  </p>
                  {results && (
                    <>
                      <SeatDonut parties={groupRows} totalSeats={results.summary.total_seats} partyColor={colorFor} />
                      <PartyLegend
                        mode={effectiveMode}
                        parties={groupRows}
                        partyColor={colorFor}
                        totalSeats={results.summary.total_seats}
                        onPartyClick={setColorMode}
                        onBack={() => setColorMode('winner')}
                      />
                    </>
                  )}
                  <p className="public-upsell">
                    Swing analysis, seat history, what-if projections and data exports are available with an account.{' '}
                    <Link to="/login">Sign in →</Link>
                  </p>
                </div>
              )}
            </aside>
            <div className="explorer-map">{map}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
