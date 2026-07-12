import { useMemo } from 'react';
import * as d3 from 'd3';

const WIDTH = 300;
const HEIGHT = 172;
const OUTER = 136;
const INNER = 92;

export default function SeatDonut({ parties, totalSeats, partyColor }) {
  const arcs = useMemo(() => {
    const pie = d3
      .pie()
      .sort(null) // keep manifest order: seats desc
      .value((p) => p.seats)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2);
    return pie((parties || []).filter((p) => p.seats > 0));
  }, [parties]);

  const arcGen = useMemo(
    () =>
      d3
        .arc()
        .innerRadius(INNER)
        .outerRadius(OUTER)
        .cornerRadius(2)
        // ~2px surface gap between segments regardless of segment size
        .padAngle(2 / OUTER)
        .padRadius(OUTER),
    []
  );

  const majority = Math.floor(totalSeats / 2) + 1;
  // Angle (from 12 o'clock, in rad) where the cumulative seat count crosses
  // the majority mark on the -90°..+90° semicircle.
  const majorityAngle = -Math.PI / 2 + Math.PI * (majority / totalSeats);
  const tick = {
    x1: Math.sin(majorityAngle) * (INNER - 6),
    y1: -Math.cos(majorityAngle) * (INNER - 6),
    x2: Math.sin(majorityAngle) * (OUTER + 6),
    y2: -Math.cos(majorityAngle) * (OUTER + 6),
  };

  return (
    <svg
      className="seat-donut"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Seats won by party. ${majority} of ${totalSeats} needed for a majority.`}
    >
      <g transform={`translate(${WIDTH / 2}, ${HEIGHT - 10})`}>
        {arcs.map((a) => (
          <path key={a.data.party} d={arcGen(a)} fill={partyColor(a.data.party)}>
            <title>
              {a.data.party}: {a.data.seats} seat{a.data.seats === 1 ? '' : 's'}
            </title>
          </path>
        ))}
        {totalSeats > 0 && (
          <line
            className="seat-donut-majority"
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
          >
            <title>Majority: {majority} seats</title>
          </line>
        )}
        <text className="seat-donut-total" textAnchor="middle" y={-30}>
          {totalSeats}
        </text>
        <text className="seat-donut-label" textAnchor="middle" y={-14}>
          seats
        </text>
        <text className="seat-donut-majority-label" textAnchor="middle" y={2}>
          {majority} for majority
        </text>
      </g>
    </svg>
  );
}
