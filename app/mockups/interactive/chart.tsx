import { ChevronRight } from 'lucide-react';
import { CHART } from './content';

// Question 3's exhibit: stacked bars of each cost as a share of revenue, by
// year, with the same numbers as a table below. The bars are SVG; the labels
// are HTML placed over them, so they stay a readable size on a phone instead
// of shrinking with the drawing.
const FILL = { product: 'var(--cobalt)', labor: 'var(--sky)', other: 'color-mix(in srgb, var(--ink) 30%, var(--white))', profit: 'var(--white)' } as const;
const TEXT = { product: 'text-(--white) font-semibold', labor: 'text-(--ink)', other: 'text-(--ink)', profit: 'text-(--ink)' } as const;
const W = 460, H = 240, BAR = 96;
const GAP = (W - 3 * BAR) / 4;
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export function CostChart({ id }: { id: string }) {
  return (
    <figure className="mt-4" role="group" aria-labelledby={`${id}-t`}>
      <p id={`${id}-t`} className="sr-only">Costs as a share of revenue, years 1 to 3</p>
      <p id={`${id}-d`} className="sr-only">Product costs rise from 40% to 46% to 52% of revenue; labor stays at 25% and other costs at 15%; profit margin falls from 20% to 14% to 8%. Revenue grows from $100M to $105M to $110M.</p>
      <div className="relative" role="img" aria-describedby={`${id}-d`} aria-label="Stacked bar chart of costs as a share of revenue">
        <div className="relative mt-5" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {CHART.years.map((year, i) => {
              const x = GAP + i * (BAR + GAP);
              let y = H;
              return CHART.series.map(sr => {
                const h = (sr.values[i] / 100) * H;
                y -= h;
                return (
                  <rect key={`${year}-${sr.key}`} x={x} y={y} width={BAR} height={h} fill={FILL[sr.key]}
                    stroke={sr.key === 'profit' ? 'var(--ink)' : 'none'} strokeDasharray={sr.key === 'profit' ? '3 2' : undefined} vectorEffect="non-scaling-stroke" />
                );
              });
            })}
          </svg>
          {/* Segment labels, placed in % of the drawing. */}
          {CHART.years.map((year, i) => {
            const cx = GAP + i * (BAR + GAP) + BAR / 2;
            let top = 0;
            return [...CHART.series].reverse().map(sr => {
              const v = sr.values[i];
              const start = top;
              const mid = top + v / 2;
              top += v;
              // A segment too short for its label gets the label just above the bar.
              const above = v < 10 && start === 0;
              return (
                <span key={`${year}-${sr.key}-l`} aria-hidden="true"
                  className={`absolute -translate-x-1/2 text-xs leading-none tabular-nums ${above ? 'text-(--ink) -translate-y-[calc(100%+4px)]' : `-translate-y-1/2 ${TEXT[sr.key]}`}`}
                  style={{ left: pct(cx, W), top: `${above ? start : mid}%` }}>
                  {v}%
                </span>
              );
            });
          })}
        </div>
        <div aria-hidden="true" className="relative mt-2 h-9">
          {CHART.years.map((year, i) => (
            <span key={year} className="absolute -translate-x-1/2 text-center text-xs leading-tight whitespace-nowrap" style={{ left: pct(GAP + i * (BAR + GAP) + BAR / 2, W) }}>
              <span className="block font-semibold">{year}</span>
              <span className="block">${CHART.revenue[i]}M revenue</span>
            </span>
          ))}
        </div>
      </div>
      <ul aria-hidden="true" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--ink)/75">
        {CHART.series.map(sr => (
          <li key={sr.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5" style={{ background: FILL[sr.key], outline: sr.key === 'profit' ? '1px dashed var(--ink)' : undefined }} />{sr.label}
          </li>
        ))}
      </ul>
      <details className="group mt-3 text-sm">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-(--cobalt) underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
          View the data as a table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <caption className="sr-only">Costs as a share of revenue, by year</caption>
            <thead>
              <tr className="border-b border-(--ink)/20"><th scope="col" className="py-1.5 pr-3 font-medium"><span className="sr-only">Measure</span></th>{CHART.years.map(y => <th key={y} scope="col" className="py-1.5 pr-3 font-medium">{y}</th>)}</tr>
            </thead>
            <tbody>
              <tr className="border-b border-(--ink)/10"><th scope="row" className="py-1.5 pr-3 font-medium">Revenue ($M)</th>{CHART.revenue.map((r, i) => <td key={i} className="py-1.5 pr-3">{r}</td>)}</tr>
              {CHART.series.map(sr => (
                <tr key={sr.key} className="border-b border-(--ink)/10">
                  <th scope="row" className="py-1.5 pr-3 font-medium">{sr.key === 'profit' ? sr.label : `${sr.label} (% of revenue)`}</th>
                  {sr.values.map((v, i) => <td key={i} className="py-1.5 pr-3">{v}%</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
