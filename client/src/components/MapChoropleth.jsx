import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { shortPartyLabel } from '../lib/partyLabel.js';
import { displayName } from '../lib/formatName.js';
import { shareBandT } from '../lib/shareBands.js';

const NO_DATA_FILL = '#e0e0e0';
const MAX_ZOOM = 12;

export default function MapChoropleth({
  boundary,
  resultsByAc,
  colorFor, // (code) => color — party or alliance depending on the view
  winnerCodeOf, // (row) => code|null used for winner-mode fill
  shareOf, // (row, code) => vote_pct for share-mode fill
  winnerTag, // (row) => string|null — extra muted tooltip line (alliance view)
  colorMode, // 'winner' | party/alliance code
  selectedAc, // {acNo, acName} | null
  onSelect, // (ac|null) => void
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState(() => d3.zoomIdentity);
  const [hover, setHover] = useState(null); // {acNo, acName, x, y}

  // Measure the container. Seed from the current rect too — don't rely
  // solely on the observer's initial callback.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const apply = (rect) =>
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    apply(el.getBoundingClientRect());
    const ro = new ResizeObserver((entries) => apply(entries[0].contentRect));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fc = useMemo(
    () => (boundary ? feature(boundary, boundary.objects.constituencies) : null),
    [boundary]
  );

  const geoPath = useMemo(() => {
    if (!fc || size.width < 10 || size.height < 10) return null;
    const projection = d3.geoMercator().fitSize([size.width, size.height], fc);
    return d3.geoPath(projection);
  }, [fc, size.width, size.height]);

  const paths = useMemo(() => {
    if (!geoPath || !fc) return [];
    return fc.features.map((f) => ({ feature: f, d: geoPath(f) || '' }));
  }, [geoPath, fc]);

  // Attach d3.zoom once.
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const zoom = d3
      .zoom()
      .scaleExtent([1, MAX_ZOOM])
      .on('zoom', (event) => setTransform(event.transform));
    zoomRef.current = zoom;
    svg.call(zoom);
    return () => svg.on('.zoom', null);
  }, []);

  // New state boundary -> reset the view.
  useEffect(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity);
    }
  }, [fc]);

  // Deselect (panel close / background click) -> ease back out.
  useEffect(() => {
    if (selectedAc == null && svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(500)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  }, [selectedAc]);

  const shareRamp = useMemo(() => {
    if (colorMode === 'winner') return null;
    return d3.interpolateRgb('#ffffff', colorFor(colorMode));
  }, [colorMode, colorFor]);

  function fillFor(acNo) {
    const row = resultsByAc ? resultsByAc.get(acNo) : null;
    if (colorMode === 'winner') {
      const code = row ? winnerCodeOf(row) : null;
      if (!code) return NO_DATA_FILL;
      return colorFor(code);
    }
    // Fixed slabs (see lib/shareBands.js) — the same shade always means the
    // same share, regardless of party or election.
    const t = shareBandT(row ? shareOf(row, colorMode) : 0);
    return t == null ? '#ffffff' : shareRamp(t);
  }

  function zoomToFeature(f) {
    if (!geoPath || !svgRef.current || !zoomRef.current) return;
    const [[x0, y0], [x1, y1]] = geoPath.bounds(f);
    const scale = Math.max(
      1,
      Math.min(
        MAX_ZOOM,
        0.9 / Math.max((x1 - x0) / size.width, (y1 - y0) / size.height)
      )
    );
    const tx = size.width / 2 - (scale * (x0 + x1)) / 2;
    const ty = size.height / 2 - (scale * (y0 + y1)) / 2;
    d3.select(svgRef.current)
      .transition()
      .duration(600)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      );
  }

  function handleFeatureClick(event, f) {
    event.stopPropagation();
    onSelect({ acNo: f.properties.ac_no, acName: f.properties.ac_name });
    zoomToFeature(f);
  }

  function handleBackgroundClick() {
    // The deselect effect above resets the zoom.
    onSelect(null);
  }

  const baseStroke = colorMode === 'winner' ? '#ffffff' : '#c9c9c9';

  const hoverEntry = hover ? paths.find((p) => p.feature.properties.ac_no === hover.acNo) : null;
  const selectedEntry = selectedAc
    ? paths.find((p) => p.feature.properties.ac_no === selectedAc.acNo)
    : null;

  const hoverRow = hover && resultsByAc ? resultsByAc.get(hover.acNo) : null;
  const hoverShare =
    hover && colorMode !== 'winner' && hoverRow ? shareOf(hoverRow, colorMode) : null;
  const hoverTag = hoverRow && winnerTag ? winnerTag(hoverRow) : null;

  const tooltipStyle = hover
    ? {
        left: Math.min(hover.x + 14, (window.innerWidth || 1200) - 250),
        top: hover.y + 14,
      }
    : null;

  return (
    <div className="map-container" ref={containerRef}>
      <svg
        ref={svgRef}
        className="map-svg"
        width="100%"
        height="100%"
        onClick={handleBackgroundClick}
        role="img"
        aria-label="Constituency map"
      >
        <g transform={transform.toString()}>
          {paths.map(({ feature: f, d }, i) => (
            <path
              key={`${f.properties.ac_no}-${i}`}
              d={d}
              className="ac-path"
              fill={fillFor(f.properties.ac_no)}
              stroke={baseStroke}
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
              onClick={(e) => handleFeatureClick(e, f)}
              onMouseEnter={(e) =>
                setHover({
                  acNo: f.properties.ac_no,
                  acName: f.properties.ac_name,
                  x: e.clientX,
                  y: e.clientY,
                })
              }
              onMouseMove={(e) =>
                setHover((h) =>
                  h && h.acNo === f.properties.ac_no
                    ? { ...h, x: e.clientX, y: e.clientY }
                    : {
                        acNo: f.properties.ac_no,
                        acName: f.properties.ac_name,
                        x: e.clientX,
                        y: e.clientY,
                      }
                )
              }
              onMouseLeave={() => setHover(null)}
            />
          ))}
          {hoverEntry && (
            <path
              d={hoverEntry.d}
              fill="none"
              stroke="#333333"
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {selectedEntry && (
            <path
              d={selectedEntry.d}
              fill="none"
              stroke="#111111"
              strokeWidth={2.2}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {hover && (
        <div className="map-tooltip" style={tooltipStyle}>
          <div className="map-tooltip-name">{hover.acName}</div>
          {hoverRow && hoverRow.winner ? (
            <>
              <div className="map-tooltip-line">
                {displayName(hoverRow.winner.candidate)} ({shortPartyLabel(hoverRow.winner.party)})
              </div>
              {hoverTag && <div className="map-tooltip-line muted">Alliance: {hoverTag}</div>}
              {hoverRow.margin != null && (
                <div className="map-tooltip-line muted">
                  Margin: {hoverRow.margin.toLocaleString('en-IN')}
                  {hoverRow.margin_pct != null ? ` (${hoverRow.margin_pct}%)` : ''}
                </div>
              )}
              {colorMode !== 'winner' && (
                <div className="map-tooltip-line muted">
                  {colorMode}: {hoverShare > 0 ? `${hoverShare}%` : 'no votes'}
                </div>
              )}
            </>
          ) : (
            <div className="map-tooltip-line muted">No result data</div>
          )}
        </div>
      )}
    </div>
  );
}
