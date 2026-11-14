import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DrillChart, categoryLabels, textWidth } from '@/components/drills/chart';
import { ChartSpecSchema, formatValue, type ChartSpecInput } from '@/lib/drills/chart-spec';

const render = (input: ChartSpecInput) => renderToStaticMarkup(createElement(DrillChart, { spec: ChartSpecSchema.parse(input) }));
const issues = (input: ChartSpecInput) => {
  const r = ChartSpecSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map(i => i.message);
};

const SPECS: Record<string, ChartSpecInput> = {
  bar: { type: 'bar', title: 'Revenue by region', categories: ['North', 'South'], series: [{ name: 'Revenue', values: [120, 80] }], y_axis: { format: { prefix: '$', suffix: 'M' } } },
  grouped_bar: { type: 'grouped_bar', title: 'Units', categories: ['2024', '2025'], series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [3, 4] }] },
  stacked_bar: { type: 'stacked_bar', title: 'Mix', categories: ['Q1', 'Q2'], series: [{ name: 'Online', values: [10, 20] }, { name: 'Store', values: [30, 25] }] },
  line: { type: 'line', title: 'Margin', categories: ['2022', '2023', '2024'], series: [{ name: 'Margin', values: [20, 15, 11] }], y_axis: { format: { suffix: '%' } } },
  waterfall: { type: 'waterfall', title: 'Profit bridge', categories: ['2024', 'Price', 'Volume', 'COGS', '2025'], series: [{ name: 'Profit', values: [50, 10, 5, -18, 47] }], totals: [0, 4] },
  dual_axis: {
    type: 'dual_axis', title: 'Revenue and margin', categories: ['2024', '2025'],
    series: [{ name: 'Revenue', values: [100, 110] }, { name: 'Margin', values: [20, 12], axis: 'right' }],
    y2_axis: { label: 'Margin %', format: { suffix: '%' } },
  },
  table: { type: 'table', title: 'Store data', table: { columns: ['Store', 'Revenue'], rows: [['A', 10], ['B', 12]] } },
};

describe('chart spec', () => {
  it.each(Object.entries(SPECS))('accepts a %s spec', (_, spec) => {
    expect(issues(spec)).toEqual([]);
  });

  it('rejects series that do not match the categories', () => {
    expect(issues({ ...SPECS.bar, series: [{ name: 'Revenue', values: [1] }] })).toEqual(['Series "Revenue" has 1 values for 2 categories']);
  });

  it('rejects a dual-axis chart without a second axis', () => {
    expect(issues({ ...SPECS.dual_axis, y2_axis: undefined })).toContain('A dual_axis chart needs y2_axis');
  });

  it('rejects ragged tables and right-axis series outside dual_axis', () => {
    expect(issues({ type: 'table', title: 't', table: { columns: ['a', 'b'], rows: [['x']] } })).toEqual(['Row 0 has 1 cells for 2 columns']);
    expect(issues({ ...SPECS.bar, series: [{ name: 'Revenue', values: [1, 2], axis: 'right' }] })).toContain('Only dual_axis charts use the right axis');
  });

  it('formats values', () => {
    expect(formatValue(2500, { prefix: '$', suffix: 'K', decimals: 0 })).toBe('$2,500K');
    expect(formatValue(-1.25, { prefix: '', suffix: '%', decimals: 1 })).toBe('−1.3%');
  });
});

describe('DrillChart', () => {
  it.each(Object.entries(SPECS))('renders a %s chart with its title and every value in a data table', (_, spec) => {
    const html = render(spec);
    const parsed = ChartSpecSchema.parse(spec);
    expect(html).toContain(parsed.title);
    expect(html).toContain('<table');
    if (parsed.type === 'table') {
      expect(html).not.toContain('<svg');
    } else {
      expect(html).toContain('<svg');
      expect(html).toContain('Show data table');
      for (const s of parsed.series) expect(html).toContain(`>${s.name}</th>`);
    }
  });

  it('draws the units label and footnotes (units and footnote traps)', () => {
    const html = render({ ...SPECS.bar, units_label: '$ thousands', footnotes: ['Excludes online sales.'] });
    expect(html).toContain('$ thousands');
    expect(html).toContain('Excludes online sales.');
  });

  it('keeps a truncated axis truncated (truncated-axis trap)', () => {
    const html = render({ ...SPECS.bar, series: [{ name: 'Revenue', values: [96, 100] }], y_axis: { min: 90 } });
    expect(html).toMatch(/>\$?90(M)?<\/text>/);
    expect(html).not.toMatch(/>\$?0(M)?<\/text>/);
  });

  it('marks waterfall steps with their sign', () => {
    const html = render(SPECS.waterfall);
    expect(html).toContain('>+10<');
    expect(html).toContain('>−18<');
  });

  it('labels the dual-axis legend with each side', () => {
    expect(render(SPECS.dual_axis)).toContain('Margin (right axis)');
  });

  it('names every category of an exhibit on a phone: one line, wrapped, or angled, never thinned', () => {
    expect(categoryLabels(['11am', '12pm', '1pm', '5pm', '6pm', '7pm', '8pm'], 41.7, 13).mode).toBe('line');
    expect(categoryLabels(['Billing errors', 'Power outages', 'Meter readings', 'Call wait times'], 73, 13)).toEqual({
      mode: 'wrap', lines: [['Billing', 'errors'], ['Power', 'outages'], ['Meter', 'readings'], ['Call wait', 'times']],
    });
    expect(categoryLabels(['2024 surplus', 'Patient revenue', 'Staff pay', 'Agency nurses', 'Supplies', '2025 surplus'], 48.7, 13).mode).toBe('angle');
    const html = renderToStaticMarkup(createElement(DrillChart, { exhibit: true, spec: ChartSpecSchema.parse({ ...SPECS.waterfall, categories: ['2024 surplus', 'Patient revenue', 'Staff pay', 'Agency nurses', '2025 surplus'] }) }));
    // Both drawings (wide and narrow) name every category, whole or wrapped.
    const drawings = html.split('<svg').slice(1).map(d => d.split('</svg>')[0]).filter(d => /viewBox="0 0 (640|360) /.test(d));
    expect(drawings).toHaveLength(2);
    for (const d of drawings) {
      const shown = [...d.matchAll(/>([^<>]+)<\/t(?:span|ext)>/g)].map(m => m[1]).join(' ');
      for (const c of ['2024 surplus', 'Patient revenue', 'Staff pay', 'Agency nurses', '2025 surplus']) expect(shown).toContain(c.split(' ').pop());
    }
    // Geist at 13px, as the browser measures it (within a few percent).
    expect(textWidth('surplus', 13)).toBeCloseTo(43.6, -1);
    expect(textWidth('Supplies', 13)).toBeCloseTo(51.4, -1);
  });

  it("shows each stacked segment's value inside it and the stack's total above", () => {
    const html = render(SPECS.stacked_bar);
    expect(html).toContain('font-weight="600" fill="currentColor">40</text>');
    expect(html).toContain('font-weight="600" fill="currentColor">45</text>');
    for (const v of ['10', '30', '20', '25']) expect(html).toContain(`dominant-baseline="central" font-size="13" fill="currentColor">${v}</text>`);
  });
});
