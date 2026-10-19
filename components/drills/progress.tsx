// Shared pieces of Your progress (server components). A skill's state is
// always written out, never shown by color alone; arrows carry their words
// for screen readers.
import Link from 'next/link';
import { STATE_COLOR, STATE_LABEL, type Arrow } from '@/lib/drills/progress/dashboard';
import type { SkillStateName } from '@/lib/drills/progress/engine';

// A tile's fill is its state's color (light grey to dark blue, as in the
// weekly chart); text is white on the three dark ones (4.5:1 or better).
const DARK: SkillStateName[] = ['practiced', 'mastered', 'validated'];
export const stateStyle = (state: SkillStateName) => ({ backgroundColor: STATE_COLOR[state], color: DARK.includes(state) ? '#ffffff' : '#111827' });

export function StateLegend() {
  return (
    <ul aria-label="States, from Not started to Validated" className="flex flex-wrap gap-2 text-xs">
      {(Object.keys(STATE_COLOR) as SkillStateName[]).map(s => (
        <li key={s} className="rounded-full px-2 py-0.5" style={stateStyle(s)}>{STATE_LABEL[s]}</li>
      ))}
    </ul>
  );
}

const ARROW: Record<Arrow, { glyph: string; words: string }> = {
  up: { glyph: '↑', words: 'improving' }, down: { glyph: '↓', words: 'slipping' }, flat: { glyph: '→', words: 'steady' }, none: { glyph: '', words: 'not enough data for a trend' },
};

export function TrendArrow({ arrow }: { arrow: Arrow }) {
  const a = ARROW[arrow];
  return (
    <span className="text-sm">
      {a.glyph && <span aria-hidden="true" className="font-semibold">{a.glyph}</span>}
      <span className="sr-only">, {a.words}</span>
    </span>
  );
}

// Where a section's data comes from (Matt, 2026-10-18: no source filter in v1).
export function Source({ from }: { from: 'drills' | 'cases' | 'both' }) {
  return <p className="text-xs text-muted-foreground">{from === 'drills' ? 'From your drills' : from === 'cases' ? 'From your full cases' : 'From your drills and full cases'}</p>;
}

// Links that change one view setting, keeping the others; the current one is marked.
export function ViewToggle({ label, name, options, current, params }: {
  label: string; name: string; options: { value: string; text: string }[]; current: string; params: Record<string, string>;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1 text-sm">
      <span className="mr-1 text-muted-foreground">{label}:</span>
      {options.map(o => {
        const q = new URLSearchParams({ ...params, [name]: o.value, changed: name });
        const on = o.value === current;
        return (
          <Link key={o.value} href={`/drills/progress?${q}`} aria-current={on ? 'true' : undefined} scroll={false}
            className={`rounded-full border px-3 py-1 ${on ? 'border-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            {o.text}
          </Link>
        );
      })}
    </nav>
  );
}
