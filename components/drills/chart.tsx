// Drill exhibit renderer (docs/prd-drills.md "Chart renderer"): a JSON chart
// spec (lib/drills/chart-spec.ts) drawn as hand-rolled SVG, with the same data
// as an HTML table for screen readers and keyboard users (WCAG 2.1 AA: "every
// chart has an accessible data-table alternative"). No hooks, so it renders
// in server and client components alike.
import { ChevronRight } from 'lucide-react';
import { formatValue, type ChartSpec, type ValueFormat } from '@/lib/drills/chart-spec';
import { WindowFrame } from '@/components/brand/window';

const WIDTH = 640;
const HEIGHT = 360;
// CasePace's categorical order (Matt, 7 Nov 2026): Cobalt first, no green
// (green means progress), the same order in every chart so a category keeps
// its colour. Validated with the dataviz skill's checker: each at least 3:1
// on white (WCAG 1.4.11), adjacent pairs apart for colour-blind readers
// (worst ΔE 12.5), the first three apart in any pairing.
const COLORS = ['#2D4BD8', '#D4581C', '#0089A8', '#A86A00', '#C0307E', '#7048C8'];
// A waterfall's rises and falls: the case data's direction, kept as they were.
const UP = '#2f8f62';
const DOWN = '#c4515a';

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

interface Bar { x: number; width: number; from: number; to: number; fill: string; label: string; gap?: boolean }

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
  // Dense categories (a score per set): label every few, so labels don't collide.
  const labelEvery = Math.max(1, Math.ceil(44 / band));
  const gap = (i: number) => spec.gaps.includes(i);

  const left = spec.series.filter(s => s.axis === 'left');
  const right = spec.series.filter(s => s.axis === 'right');

  // Values the left scale must cover, per chart type.
  let leftValues: number[];
  const running: { from: number; to: number }[] = [];
  if (spec.type === 'stacked_bar') {
    leftValues = spec.categories.map((_, i) => left.reduce((sum, s) => sum + s.values[i], 0)).filter((_, i) => !gap(i));
  } else if (spec.type === 'waterfall') {
    let total = 0;
    spec.series[0].values.forEach((v, i) => {
      if (spec.totals.includes(i)) { running.push({ from: 0, to: v }); total = v; }
      else { running.push({ from: total, to: total + v }); total += v; }
    });
    leftValues = running.flatMap(r => [r.from, r.to]);
  } else {
    leftValues = left.flatMap(s => s.values.filter((_, i) => !gap(i)));
  }
  leftValues.push(...spec.reference_lines.map(r => r.value));
  if (leftValues.length === 0) leftValues.push(0);
  const yl = makeScale(leftValues, spec.y_axis, top, bottom);
  const yr = dual && spec.y2_axis ? makeScale(right.flatMap(s => s.values), spec.y2_axis, top, bottom) : null;
  const base = (scale: Scale) => scale.y(Math.min(Math.max(0, scale.lo), scale.hi));

  const bars: Bar[] = [];
  const lines: { points: ([number, number] | null)[]; color: string; labels: string[]; values: number[] }[] = [];
  const barSeries = dual ? spec.series.filter(s => (s.mark ?? (s.axis === 'left' ? 'bar' : 'line')) === 'bar') : spec.series;
  const lineSeries = dual ? spec.series.filter(s => !barSeries.includes(s)) : [];
  const colorOf = (name: string) => spec.series.find(s => s.name === name)?.color ?? COLORS[spec.series.findIndex(s => s.name === name) % COLORS.length];

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
      if (gap(i)) return;
      for (const s of spec.series) {
        const v = s.values[i];
        bars.push({
          x: bandX(i) + band * 0.2, width: band * 0.6,
          from: yl.y(acc), to: yl.y(acc + v),
          fill: colorOf(s.name), label: formatValue(v, fmt), gap: true,
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
          fill: group > 1 ? colorOf(s.name) : COLORS[0], label: formatValue(v, fmt), gap: group > 1,
        });
      });
    });
  }
  for (const s of lineSeries) {
    const scale = s.axis === 'right' && yr ? yr : yl;
    const fmt = seriesFormat(spec, s.axis);
    lines.push({
      points: s.values.map((v, i) => (gap(i) ? null : [bandX(i) + band / 2, scale.y(v)])),
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
          <text x={margin.left - 8} y={yl.y(t)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="var(--muted-foreground)">
            {formatValue(t, leftFmt)}
          </text>
        </g>
      ))}
      {yr?.ticks.map(t => (
        <text key={`r${t}`} x={WIDTH - margin.right + 8} y={yr.y(t)} dominantBaseline="middle" fontSize={12} fill="var(--muted-foreground)">
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
          <rect x={b.x} width={b.width} y={Math.min(b.from, b.to)} height={Math.max(1, Math.abs(b.to - b.from))} fill={b.fill}
            {...(b.gap && { stroke: 'var(--white)', strokeWidth: 2 })} />
          {spec.show_values && (
            <text x={b.x + b.width / 2} y={Math.min(b.from, b.to) - 4} textAnchor="middle" fontSize={11} fill="currentColor">
              {b.label}
            </text>
          )}
        </g>
      ))}
      {lines.map((l, i) => (
        <g key={`p${i}`}>
          {/* A gap breaks the line into runs. */}
          {l.points.reduce<[number, number][][]>((runs, p) => {
            if (!p) runs.push([]);
            else runs[runs.length - 1].push(p);
            return runs;
          }, [[]]).filter(run => run.length > 1).map((run, k) => (
            <polyline key={k} points={run.map(p => p.join(',')).join(' ')} fill="none" stroke={l.color} strokeWidth={2.5} />
          ))}
          {l.points.map((p, j) => p && (
            <g key={j}>
              {spec.hollow.includes(j)
                ? <circle cx={p[0]} cy={p[1]} r={4} fill="var(--background, #fff)" stroke={l.color} strokeWidth={2} />
                : <circle cx={p[0]} cy={p[1]} r={3.5} fill={l.color} />}
              {spec.show_values && (
                <text x={p[0]} y={p[1] - 8} textAnchor="middle" fontSize={11} fill="currentColor">{l.labels[j]}</text>
              )}
            </g>
          ))}
        </g>
      ))}
      {/* Reference lines and markers last, so their labels sit above the data. */}
      {spec.reference_lines.map((r, i) => (
        <g key={`r${i}`}>
          <line x1={margin.left} x2={WIDTH - margin.right} y1={yl.y(r.value)} y2={yl.y(r.value)} stroke="currentColor" strokeDasharray="6 4" />
          <text x={WIDTH - margin.right} y={yl.y(r.value) + 14} textAnchor="end" fontSize={11} fill="currentColor" stroke="var(--background, #fff)" strokeWidth={4} paintOrder="stroke">{r.label}</text>
        </g>
      ))}
      {spec.markers.map((m, i) => (
        <g key={`m${i}`}>
          <line x1={bandX(m.index)} x2={bandX(m.index)} y1={top} y2={bottom} stroke="currentColor" strokeDasharray="2 3" />
          {/* Past the middle, the label sits left of its line so it isn't cut off. */}
          <text x={bandX(m.index) + (bandX(m.index) > WIDTH / 2 ? -4 : 4)} y={top + 10 + (i % 2) * 14} textAnchor={bandX(m.index) > WIDTH / 2 ? 'end' : 'start'} fontSize={11} fill="currentColor" stroke="var(--background, #fff)" strokeWidth={4} paintOrder="stroke">{m.label}</text>
        </g>
      ))}
      <line x1={margin.left} x2={WIDTH - margin.right} y1={bottom} y2={bottom} stroke="currentColor" />
      {spec.categories.map((c, i) => i % labelEvery === 0 && (
        <text key={`c${i}`} x={bandX(i) + band / 2} y={bottom + 18} textAnchor="middle" fontSize={12} fill="currentColor">{c}</text>
      ))}
      {legend && legendEntries.map(({ name, label, x }, i) => (
        <g key={`k${i}`} transform={`translate(${x} ${HEIGHT - 22})`}>
          <rect width={12} height={12} y={-10} rx={2} fill={colorOf(name)} />
          <text x={18} fontSize={12} fill="currentColor">{label}</text>
        </g>
      ))}
    </svg>
  );
}

function DataTable({ spec, visible }: { spec: ChartSpec; visible: boolean }) {
  const cell = 'border-b border-ink/10 px-3 py-1.5 text-left tabular-nums';
  const table = spec.type === 'table' && spec.table
    ? { columns: spec.table.columns, rows: spec.table.rows.map(r => r.map(String)) }
    : {
        columns: ['', ...spec.series.map(s => s.name), ...(spec.markers.length || spec.notes.length ? ['Note'] : [])],
        rows: spec.categories.map((c, i) => [
          c, ...spec.series.map(s => (spec.gaps.includes(i) ? '–' : formatValue(s.values[i], seriesFormat(spec, s.axis)))),
          ...(spec.markers.length || spec.notes.length
            ? [[...spec.markers.filter(m => m.index === i).map(m => m.label), ...spec.notes.filter(n => n.index === i).map(n => n.text)].join('; ')] : []),
        ]),
      };
  // A wide table scrolls inside its own box, not the page (WCAG 1.4.10
  // allows two-dimensional scrolling for data tables); focusable so keyboard
  // users can scroll it too.
  return (
    <div role="region" aria-label={`${spec.title}: data table`} tabIndex={0}
      className={`overflow-x-auto rounded-sm ${visible ? '' : 'mt-2'}`}>
    <table className="t-small w-full border-collapse">
      <caption className="sr-only">{spec.title}{spec.units_label ? ` (${spec.units_label})` : ''}</caption>
      <thead>
        <tr className="text-ink/70">{table.columns.map((c, i) => <th key={i} scope="col" className={`${cell} border-ink/20 font-medium`}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {table.rows.map((row, i) => (
          <tr key={i}>
            {row.map((v, j) => j === 0
              ? <th key={j} scope="row" className={`${cell} font-medium`}>{v}</th>
              : <td key={j} className={cell}>{v}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

// `exhibit`: case material (a drill item, its worked example and results),
// in the homepage's window with its label above ("Exhibit · Market share by
// player"); otherwise a plain chart (Your progress).
export function DrillChart({ spec, exhibit = false }: { spec: ChartSpec; exhibit?: boolean }) {
  const body = (
    <>
      {spec.type === 'table' ? (
        <DataTable spec={spec} visible />
      ) : (
        <>
          <Plot spec={spec} />
          <details className="group t-small">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-ink/80 hover:text-cobalt [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden="true" className="size-4 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />Show data table
            </summary>
            <DataTable spec={spec} visible={false} />
          </details>
        </>
      )}
    </>
  );
  const notes = (
    <>
      {spec.reference_lines.map((r, i) => (
        <p key={`ref${i}`} className="t-label text-ink/70">Dashed line: {r.label}.</p>
      ))}
      {spec.markers.length > 0 && <p className="t-label text-ink/70">▲ ▼ mark a move up or down a tier, or to another kind of drill: a dip right after moving up is expected.</p>}
      {spec.footnotes.map((note, i) => (
        <p key={i} className="t-label text-ink/70">{note}</p>
      ))}
    </>
  );
  if (exhibit) {
    return (
      <figure className="space-y-2" aria-label={`${TYPE_NAMES[spec.type]}: ${spec.title}`}>
        <figcaption className="t-label"><span className="font-semibold">Exhibit</span><span className="text-ink/70"> · {spec.title}</span></figcaption>
        <WindowFrame>
          <div className="space-y-3 p-4 sm:p-5">
            {spec.units_label && <p className="t-label text-ink/70">{spec.units_label}</p>}
            {body}
          </div>
        </WindowFrame>
        {notes}
      </figure>
    );
  }
  return (
    <figure className="space-y-2" aria-label={`${TYPE_NAMES[spec.type]}: ${spec.title}`}>
      <figcaption>
        <span className="t-small font-semibold">{spec.title}</span>
        {spec.units_label && <span className="t-label block text-ink/70">{spec.units_label}</span>}
      </figcaption>
      {body}
      {notes}
    </figure>
  );
}
