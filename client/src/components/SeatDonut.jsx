import { useMemo } from 'react';
import * as d3 from 'd3';

const WIDTH = 300;
const HEIGHT = 168;
const OUTER = 138;
const INNER = 88;

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
    () => d3.arc().innerRadius(INNER).outerRadius(OUTER).padAngle(0.004),
    []
  );

  return (
    <svg
      className="seat-donut"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Seats won by party"
    >
      <g transform={`translate(${WIDTH / 2}, ${HEIGHT - 8})`}>
        {arcs.map((a) => (
          <path key={a.data.party} d={arcGen(a)} fill={partyColor(a.data.party)}>
            <title>
              {a.data.party}: {a.data.seats} seat{a.data.seats === 1 ? '' : 's'}
            </title>
          </path>
        ))}
        <text className="seat-donut-total" textAnchor="middle" y={-22}>
          {totalSeats}
        </text>
        <text className="seat-donut-label" textAnchor="middle" y={-4}>
          seats
        </text>
      </g>
    </svg>
  );
}
