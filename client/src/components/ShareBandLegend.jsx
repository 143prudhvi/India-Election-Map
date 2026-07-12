import * as d3 from 'd3';
import { SHARE_BANDS } from '../lib/shareBands.js';
import { shortPartyLabel } from '../lib/partyLabel.js';

// The map key shown while a party/bloc's vote share is mapped: the fixed
// colour slabs + a way back to the winner map.
export default function ShareBandLegend({ code, color, onBack }) {
  const ramp = d3.interpolateRgb('#ffffff', color);
  return (
    <div className="map-key">
      <div className="map-key-head">
        <span className="legend-caption" title={code}>
          {shortPartyLabel(code)} vote share
        </span>
        <button type="button" className="legend-back" onClick={onBack}>
          ‹ Winner map
        </button>
      </div>
      <div className="legend-bands">
        {SHARE_BANDS.map((b) => (
          <div key={b.label} className="legend-band">
            <span className="legend-band-swatch" style={{ backgroundColor: ramp(b.t) }} />
            <span className="legend-band-label">{b.label.replace('%', '')}</span>
          </div>
        ))}
      </div>
      <p className="legend-note">White — no votes / did not contest</p>
    </div>
  );
}
