import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { shortPartyLabel } from '../lib/partyLabel.js';
import { displayName } from '../lib/formatName.js';

const MAX_ZOOM = 12;

export default function MapChoropleth({
  boundary,
  resultsByAc,
  fillFor, // (acNo) => color string — computed per active map mode in Explorer
  baseStroke = '#ffffff', // constituency outline color
  tooltipExtra, // (row) => Array<{text, muted?}> — mode-specific tooltip lines
  selectedAc, // {acNo, acName} | null
  onSelect, // (ac|null) => void
  svgApiRef, // optional ref -> { exportPng() } for the download button
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

  const hoverEntry = hover ? paths.find((p) => p.feature.properties.ac_no === hover.acNo) : null;
  const selectedEntry = selectedAc
    ? paths.find((p) => p.feature.properties.ac_no === selectedAc.acNo)
    : null;

  const hoverRow = hover && resultsByAc ? resultsByAc.get(hover.acNo) : null;
  const hoverLines = hoverRow && tooltipExtra ? tooltipExtra(hoverRow) : [];

  // Rasterize the current SVG to a PNG blob for the download button.
  useImperativeHandle(
    svgApiRef,
    () => ({
      exportPng(scale = 2) {
        return new Promise((resolve, reject) => {
          const svg = svgRef.current;
          if (!svg) return reject(new Error('map not ready'));
          const w = size.width || 800;
          const h = size.height || 600;
          const clone = svg.cloneNode(true);
          clone.setAttribute('width', w);
          clone.setAttribute('height', h);
          clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
          const xml = new XMLSerializer().serializeToString(clone);
          const svg64 = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = w * scale;
            canvas.height = h * scale;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/png');
          };
          img.onerror = () => reject(new Error('render failed'));
          img.src = svg64;
        });
      },
    }),
    [size.width, size.height]
  );

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
              {hoverLines.map((line, i) => (
                <div key={i} className={line.muted ? 'map-tooltip-line muted' : 'map-tooltip-line'}>
                  {line.text}
                </div>
              ))}
            </>
          ) : (
            <div className="map-tooltip-line muted">No result data</div>
          )}
        </div>
      )}
    </div>
  );
}
