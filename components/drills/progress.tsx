// Shared pieces of Your progress (server components). A skill's state is
// always written out, never shown by color alone; arrows carry their words
// for screen readers.
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { STATE_COLOR, STATE_DESCRIPTION, STATE_LABEL, type Arrow } from '@/lib/drills/progress/dashboard';
import { TermTip } from '@/components/brand/term-tip';
import type { SkillStateName } from '@/lib/drills/progress/engine';

// A tile's fill is its state's colour (as in the weekly chart); white text on
// Cobalt, Ink on the rest (4.5:1 or better, Ink on Mastery green 5.4:1).
const DARK: SkillStateName[] = ['practiced'];
export const stateStyle = (state: SkillStateName) => ({ backgroundColor: STATE_COLOR[state], color: DARK.includes(state) ? 'var(--white)' : 'var(--ink)' });

// The states as one ordered scale (Matt, 13 Nov), Not started → Mastered,
// each with its meaning on hover, focus or tap. Validated, the step a full
// case adds, shares Mastered's green and isn't a separate step here.
const SCALE: SkillStateName[] = ['not_started', 'learning', 'recognizes', 'practiced', 'mastered'];
export function StateLegend() {
  return (
    <ol aria-label="States, from Not started to Mastered" className="t-label flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {SCALE.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          <TermTip tip={STATE_DESCRIPTION[s]} className="rounded-full px-2.5 py-0.5 font-semibold" style={stateStyle(s)}>{STATE_LABEL[s]}</TermTip>
          {i < SCALE.length - 1 && <ArrowRight aria-hidden="true" className="size-3.5 text-ink/40" />}
        </li>
      ))}
    </ol>
  );
}

const ARROW: Record<Arrow, { Icon: typeof ArrowUp | null; words: string }> = {
  up: { Icon: ArrowUp, words: 'improving' }, down: { Icon: ArrowDown, words: 'slipping' }, flat: { Icon: ArrowRight, words: 'steady' }, none: { Icon: null, words: 'not enough data for a trend' },
};

export function TrendArrow({ arrow }: { arrow: Arrow }) {
  const { Icon, words } = ARROW[arrow];
  return (
    <span className="inline-flex items-center">
      {Icon && <Icon aria-hidden="true" className="size-4" strokeWidth={2.5} />}
      <span className="sr-only">, {words}</span>
    </span>
  );
}

// Where a section's data comes from (Matt, 2026-10-18: no source filter in v1).
export function Source({ from }: { from: 'drills' | 'cases' | 'both' }) {
  return <p className="t-label text-ink/70">{from === 'drills' ? 'From your drills' : from === 'cases' ? 'From your full cases' : 'From your drills and full cases'}</p>;
}

// Links that change one view setting, keeping the others; the current one is marked.
export function ViewToggle({ label, name, options, current, params }: {
  label: string; name: string; options: { value: string; text: string }[]; current: string; params: Record<string, string>;
}) {
  return (
    <nav aria-label={label} className="t-small flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-ink/70">{label}:</span>
      {options.map(o => {
        const q = new URLSearchParams({ ...params, [name]: o.value, changed: name });
        const on = o.value === current;
        return (
          <Link key={o.value} href={`/drills/progress?${q}`} aria-current={on ? 'true' : undefined} scroll={false}
            className={`rounded-full border px-3 py-1 transition-colors motion-reduce:transition-none ${on ? 'border-cobalt bg-sky/50 font-semibold text-ink' : 'border-ink/20 bg-white text-ink/75 hover:border-ink/40 hover:text-ink'}`}>
            {o.text}
          </Link>
        );
      })}
    </nav>
  );
}
