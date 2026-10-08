// Drill exhibit renderer (docs/prd-drills.md "Chart renderer"): a JSON chart
// spec (lib/drills/chart-spec.ts) drawn as hand-rolled SVG, with the same data
// as an HTML table for screen readers and keyboard users (WCAG 2.1 AA: "every
// chart has an accessible data-table alternative"). No hooks, so it renders
// in server and client components alike.
import { formatValue, type ChartSpec, type ValueFormat } from '@/lib/drills/chart-spec';

const WIDTH = 640;
const HEIGHT = 360;
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
const UP = 'var(--chart-2)';
const DOWN = 'var(--destructive)';

const TYPE_NAMES: Record<ChartSpec['type'], string> = {
  bar: 'Bar chart',
  grouped_bar: 'Grouped bar chart',
  stacked_bar: 'Stacked bar chart',
  line: 'Line chart',
  waterfall: 'Waterfall chart',
  dual_axis: 'Chart with two axes',
  table: 'Table',
};

function niceStep(raw: number): number {
  if (raw <= 0 || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find(m => m * power >= raw)!;
  return step * power;
}

interface Scale {
  lo: number;
  hi: number;
  ticks: number[];
  y: (v: number) => number;
}

// The axis min, when set, is honored exactly: a truncated axis is a trap the
// student is meant to catch, so the renderer never "fixes" it to zero.
function makeScale(values: number[], axis: ChartSpec['y_axis'], top: number, bottom: number): Scale {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const floor = axis.min ?? Math.min(0, dataMin);
  const step = niceStep(((axis.max ?? dataMax) - floor) / 4);
  const lo = axis.min ?? Math.floor(floor / step) * step;
  const hi = axis.max ?? Math.max(lo + step, Math.ceil(dataMax / step) * step);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step * 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  return { lo, hi, ticks, y };
}

interface Bar { x: number; width: number; from: number; to: number; fill: string; label: string }

function seriesFormat(spec: ChartSpec, axis: 'left' | 'right'): ValueFormat {
  return (axis === 'right' ? spec.y2_axis?.format : spec.y_axis.format) ?? { prefix: '', suffix: '', decimals: 0 };
}

function Plot({ spec }: { spec: ChartSpec }) {
  const dual = spec.type === 'dual_axis';
  const legend = spec.series.length > 1;
  const margin = { top: 20, right: dual ? 64 : 16, bottom: legend ? 72 : 44, left: 64 };
  const top = margin.top;
  const bottom = HEIGHT - margin.bottom;
  const plotWidth = WIDTH - margin.left - margin.right;
  const band = plotWidth / spec.categories.length;
  const bandX = (i: number) => margin.left + i * band;

  const left = spec.series.filter(s => s.axis === 'left');
  const right = spec.series.filter(s => s.axis === 'right');

  // Values the left scale must cover, per chart type.
  let leftValues: number[];
  const running: { from: number; to: number }[] = [];
  if (spec.type === 'stacked_bar') {
    leftValues = spec.categories.map((_, i) => left.reduce((sum, s) => sum + s.values[i], 0));
  } else if (spec.type === 'waterfall') {
    let total = 0;
    spec.series[0].values.forEach((v, i) => {
      if (spec.totals.includes(i)) { running.push({ from: 0, to: v }); total = v; }
      else { running.push({ from: total, to: total + v }); total += v; }
    });
    leftValues = running.flatMap(r => [r.from, r.to]);
  } else {
    leftValues = left.flatMap(s => s.values);
  }
  const yl = makeScale(leftValues, spec.y_axis, top, bottom);
  const yr = dual && spec.y2_axis ? makeScale(right.flatMap(s => s.values), spec.y2_axis, top, bottom) : null;
  const base = (scale: Scale) => scale.y(Math.min(Math.max(0, scale.lo), scale.hi));

  const bars: Bar[] = [];
  const lines: { points: [number, number][]; color: string; labels: string[]; values: number[] }[] = [];
  const barSeries = dual ? spec.series.filter(s => (s.mark ?? (s.axis === 'left' ? 'bar' : 'line')) === 'bar') : spec.series;
  const lineSeries = dual ? spec.series.filter(s => !barSeries.includes(s)) : [];
  const colorOf = (name: string) => COLORS[spec.series.findIndex(s => s.name === name) % COLORS.length];

  if (spec.type === 'line') {
    lineSeries.push(...spec.series);
  } else if (spec.type === 'waterfall') {
    const fmt = seriesFormat(spec, 'left');
    running.forEach((r, i) => {
      const isTotal = spec.totals.includes(i);
      const v = spec.series[0].values[i];
      bars.push({
        x: bandX(i) + band * 0.2, width: band * 0.6,
        from: yl.y(r.from), to: yl.y(r.to),
        fill: isTotal ? COLORS[0] : v >= 0 ? UP : DOWN,
        label: isTotal ? formatValue(v, fmt) : `${v >= 0 ? '+' : ''}${formatValue(v, fmt)}`,
      });
    });
  } else if (spec.type === 'stacked_bar') {
    const fmt = seriesFormat(spec, 'left');
    spec.categories.forEach((_, i) => {
      let acc = 0;
      for (const s of spec.series) {
        const v = s.values[i];
        bars.push({
          x: bandX(i) + band * 0.2, width: band * 0.6,
          from: yl.y(acc), to: yl.y(acc + v),
          fill: colorOf(s.name), label: formatValue(v, fmt),
        });
        acc += v;
      }
    });
  } else {
    const group = barSeries.length;
    const inner = band * 0.7;
    barSeries.forEach((s, k) => {
      const scale = s.axis === 'right' && yr ? yr : yl;
      const fmt = seriesFormat(spec, s.axis);
      s.values.forEach((v, i) => {
        bars.push({
          x: bandX(i) + band * 0.15 + (inner / group) * k, width: inner / group,
          from: base(scale), to: scale.y(v),
          fill: group > 1 ? colorOf(s.name) : COLORS[0], label: formatValue(v, fmt),
        });
      });
    });
  }
  for (const s of lineSeries) {
    const scale = s.axis === 'right' && yr ? yr : yl;
    const fmt = seriesFormat(spec, s.axis);
    lines.push({
      points: s.values.map((v, i) => [bandX(i) + band / 2, scale.y(v)]),
      color: colorOf(s.name),
      labels: s.values.map(v => formatValue(v, fmt)),
      values: s.values,
    });
  }

  // Legend entries sit side by side, each as wide as its label (about 6.5px a
  // character at 12px), so long dual-axis labels don't run into each other.
  let legendX = margin.left;
  const legendEntries = spec.series.map(s => {
    const label = `${s.name}${dual ? ` (${s.axis} axis)` : ''}`;
    const entry = { name: s.name, label, x: legendX };
    legendX += 18 + label.length * 6.5 + 20;
    return entry;
  });

  const leftFmt = seriesFormat(spec, 'left');
  const rightFmt = seriesFormat(spec, 'right');
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" aria-hidden="true" focusable="false">
      {yl.ticks.map(t => (
        <g key={`l${t}`}>
          <line x1={margin.left} x2={WIDTH - margin.right} y1={yl.y(t)} y2={yl.y(t)} stroke="var(--border)" />
          <text x={margin.left - 8} y={yl.y(t)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="currentColor">
            {formatValue(t, leftFmt)}
          </text>
        </g>
      ))}
      {yr?.ticks.map(t => (
        <text key={`r${t}`} x={WIDTH - margin.right + 8} y={yr.y(t)} dominantBaseline="middle" fontSize={12} fill="currentColor">
          {formatValue(t, rightFmt)}
        </text>
      ))}
      {spec.y_axis.label && (
        <text transform={`translate(14 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="currentColor">
          {spec.y_axis.label}
        </text>
      )}
      {yr && spec.y2_axis?.label && (
        <text transform={`translate(${WIDTH - 10} ${(top + bottom) / 2}) rotate(90)`} textAnchor="middle" fontSize={12} fill="currentColor">
          {spec.y2_axis.label}
        </text>
      )}
      {bars.map((b, i) => (
        <g key={`b${i}`}>
          <rect x={b.x} width={b.width} y={Math.min(b.from, b.to)} height={Math.max(1, Math.abs(b.to - b.from))} fill={b.fill} />
          {spec.show_values && (
            <text x={b.x + b.width / 2} y={Math.min(b.from, b.to) - 4} textAnchor="middle" fontSize={11} fill="currentColor">
              {b.label}
            </text>
          )}
        </g>
      ))}
      {lines.map((l, i) => (
        <g key={`p${i}`}>
          <polyline points={l.points.map(p => p.join(',')).join(' ')} fill="none" stroke={l.color} strokeWidth={2.5} />
          {l.points.map(([x, y], j) => (
            <g key={j}>
              <circle cx={x} cy={y} r={3.5} fill={l.color} />
              {spec.show_values && (
                <text x={x} y={y - 8} textAnchor="middle" fontSize={11} fill="currentColor">{l.labels[j]}</text>
              )}
            </g>
          ))}
        </g>
      ))}
      <line x1={margin.left} x2={WIDTH - margin.right} y1={bottom} y2={bottom} stroke="currentColor" />
      {spec.categories.map((c, i) => (
        <text key={`c${i}`} x={bandX(i) + band / 2} y={bottom + 18} textAnchor="middle" fontSize={12} fill="currentColor">{c}</text>
      ))}
      {legend && legendEntries.map(({ name, label, x }, i) => (
        <g key={`k${i}`} transform={`translate(${x} ${HEIGHT - 22})`}>
          <rect width={12} height={12} y={-10} fill={colorOf(name)} />
          <text x={18} fontSize={12} fill="currentColor">{label}</text>
        </g>
      ))}
    </svg>
  );
}

function DataTable({ spec, visible }: { spec: ChartSpec; visible: boolean }) {
  const cell = 'border border-border px-2 py-1 text-left';
  const table = spec.type === 'table' && spec.table
    ? { columns: spec.table.columns, rows: spec.table.rows.map(r => r.map(String)) }
    : {
        columns: ['', ...spec.series.map(s => s.name)],
        rows: spec.categories.map((c, i) => [c, ...spec.series.map(s => formatValue(s.values[i], seriesFormat(spec, s.axis)))]),
      };
  return (
    <table className={`w-full border-collapse text-sm ${visible ? '' : 'mt-2'}`}>
      <caption className="sr-only">{spec.title}{spec.units_label ? ` (${spec.units_label})` : ''}</caption>
      <thead>
        <tr>{table.columns.map((c, i) => <th key={i} scope="col" className={cell}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {table.rows.map((row, i) => (
          <tr key={i}>
            {row.map((v, j) => j === 0
              ? <th key={j} scope="row" className={cell}>{v}</th>
              : <td key={j} className={cell}>{v}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DrillChart({ spec }: { spec: ChartSpec }) {
  return (
    <figure className="space-y-2" aria-label={`${TYPE_NAMES[spec.type]}: ${spec.title}`}>
      <figcaption>
        <span className="font-medium">{spec.title}</span>
        {spec.units_label && <span className="block text-sm text-muted-foreground">{spec.units_label}</span>}
      </figcaption>
      {spec.type === 'table' ? (
        <DataTable spec={spec} visible />
      ) : (
        <>
          <Plot spec={spec} />
          <details className="text-sm">
            <summary className="cursor-pointer">Show data table</summary>
            <DataTable spec={spec} visible={false} />
          </details>
        </>
      )}
      {spec.footnotes.map((note, i) => (
        <p key={i} className="text-xs text-muted-foreground">{note}</p>
      ))}
    </figure>
  );
}
