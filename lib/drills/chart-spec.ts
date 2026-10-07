// JSON chart spec for drill exhibits (docs/prd-drills.md "Chart renderer"),
// rendered by components/drills/chart.tsx. Client-safe: a spec describes what
// the student sees. Which element is a planted trap (EX-2) is answer-key data
// and lives in the item's server-side key, never here. The trap-capable
// elements are ordinary fields: a y-axis that starts above zero, a units label,
// footnotes, a second axis.
import { z } from 'zod';

export const ChartTypeSchema = z.enum([
  'bar', 'grouped_bar', 'stacked_bar', 'line', 'waterfall', 'dual_axis', 'table',
]);
export type ChartType = z.infer<typeof ChartTypeSchema>;

const ValueFormatSchema = z.object({
  prefix: z.string().default(''),   // "$"
  suffix: z.string().default(''),   // "%", "M"
  decimals: z.number().int().min(0).max(4).default(0),
});

const AxisSchema = z.object({
  label: z.string().optional(),
  // A start above zero is how a truncated-axis trap is drawn.
  min: z.number().optional(),
  max: z.number().optional(),
  format: ValueFormatSchema.prefault({}),
});

const SeriesSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.number()),
  axis: z.enum(['left', 'right']).default('left'),
  mark: z.enum(['bar', 'line']).optional(),        // dual_axis only
});

export const ChartSpecSchema = z.object({
  type: ChartTypeSchema,
  title: z.string().min(1),
  // Shown under the title, e.g. "$ thousands". How a units trap is drawn.
  units_label: z.string().optional(),
  categories: z.array(z.string()).default([]),
  series: z.array(SeriesSchema).default([]),
  y_axis: AxisSchema.prefault({}),
  y2_axis: AxisSchema.optional(),
  // Waterfall: indices of bars drawn from zero (start and end totals);
  // every other bar is a step from the running total.
  totals: z.array(z.number().int().nonnegative()).default([]),
  show_values: z.boolean().default(true),
  table: z.object({
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.union([z.string(), z.number()]))).min(1),
  }).optional(),
  footnotes: z.array(z.string()).default([]),
}).superRefine((spec, ctx) => {
  const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: 'custom', message, path });
  if (spec.type === 'table') {
    if (!spec.table) issue('A table chart needs `table`', ['table']);
    else spec.table.rows.forEach((row, i) => {
      if (row.length !== spec.table!.columns.length) issue(`Row ${i} has ${row.length} cells for ${spec.table!.columns.length} columns`, ['table', 'rows', i]);
    });
    return;
  }
  if (spec.categories.length === 0) issue('Needs at least one category', ['categories']);
  if (spec.series.length === 0) issue('Needs at least one series', ['series']);
  spec.series.forEach((s, i) => {
    if (s.values.length !== spec.categories.length) {
      issue(`Series "${s.name}" has ${s.values.length} values for ${spec.categories.length} categories`, ['series', i, 'values']);
    }
  });
  if ((spec.type === 'bar' || spec.type === 'waterfall') && spec.series.length !== 1) {
    issue(`A ${spec.type} chart takes exactly one series`, ['series']);
  }
  if (spec.type === 'dual_axis') {
    const sides = new Set(spec.series.map(s => s.axis));
    if (spec.series.length !== 2 || sides.size !== 2) issue('A dual_axis chart takes two series, one per axis', ['series']);
    if (!spec.y2_axis) issue('A dual_axis chart needs y2_axis', ['y2_axis']);
  } else if (spec.series.some(s => s.axis === 'right')) {
    issue('Only dual_axis charts use the right axis', ['series']);
  }
  if (spec.type === 'stacked_bar' && spec.series.some(s => s.values.some(v => v < 0))) {
    issue('Stacked bars take non-negative values', ['series']);
  }
  spec.totals.forEach((t, i) => {
    if (spec.type !== 'waterfall') issue('Only waterfall charts use totals', ['totals', i]);
    else if (t >= spec.categories.length) issue(`Total index ${t} is out of range`, ['totals', i]);
  });
});

export type ChartSpec = z.infer<typeof ChartSpecSchema>;
export type ChartSpecInput = z.input<typeof ChartSpecSchema>;
export type ValueFormat = z.infer<typeof ValueFormatSchema>;

export function formatValue(value: number, format: ValueFormat): string {
  const sign = value < 0 ? '−' : '';
  const body = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: format.decimals,
    maximumFractionDigits: format.decimals,
  });
  return `${sign}${format.prefix}${body}${format.suffix}`;
}
