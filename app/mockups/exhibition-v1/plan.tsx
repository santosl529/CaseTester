import { BookOpen, PlayCircle } from 'lucide-react';
import { Reveal } from '../_shared/reveal';
import { PLAN_STEPS } from './content';
import s from './exhibition.module.css';

// Section 3 (Matt's brief: a simpler first version is fine): five steps
// assemble along a Week 1 → Week 6 track when the section scrolls in, and the
// focus-area chip ends Mastered. Horizontal on desktop, vertical on phones.
const SKILL = 'Case-specific structure';
const DRILLS = ['Spot the gap', 'Fix the framework', 'Framework builder'];

function Artefact({ kind }: { kind: typeof PLAN_STEPS[number]['kind'] }) {
  switch (kind) {
    case 'focus':
      return (
        <p className="inline-flex flex-wrap items-center gap-2 rounded-[6px] border border-(--ink)/12 bg-(--white) px-3 py-2 text-sm font-medium">
          {SKILL}<span className="rounded-full bg-(--cobalt) px-2 py-0.5 text-xs font-semibold text-(--white)">Focus area</span>
        </p>
      );
    case 'lesson':
      return (
        <div className="rounded-[8px] border border-(--ink)/12 bg-(--white) p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs text-(--ink)/65"><BookOpen aria-hidden="true" className="h-3.5 w-3.5" />Lesson · 3 min</p>
          <p className="mt-1 font-medium leading-snug">Building a case-specific framework</p>
        </div>
      );
    case 'drills':
      return (
        <ul className="grid gap-1.5">
          {DRILLS.map((d, i) => (
            <li key={d} className="rounded-[8px] border border-(--ink)/12 bg-(--white) px-3 py-2 text-sm font-medium" style={{ marginLeft: `${i * 0.5}rem` }}>{d}</li>
          ))}
        </ul>
      );
    case 'mock':
      return (
        <div className="rounded-[8px] border border-(--ink)/12 bg-(--white) p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs text-(--ink)/65"><PlayCircle aria-hidden="true" className="h-3.5 w-3.5" />Mock interview</p>
          <p className="mt-1 font-medium leading-snug">Full case · about 25 min</p>
        </div>
      );
    case 'mastered':
      return (
        // The same chip as week 1; its badge turns from Focus area to Mastered.
        <p className="inline-flex flex-wrap items-center gap-2 rounded-[6px] border border-(--mastery) bg-(--white) px-3 py-2 text-sm font-medium">
          {SKILL}<span className={`${s.masteredBadge} rounded-full bg-(--mastery) px-2 py-0.5 text-xs font-semibold text-(--ink)`}>Mastered</span>
        </p>
      );
  }
}

export function PlanTimeline() {
  return (
    <Reveal threshold={0.3} className={`${s.plan} relative`}>
      {/* The track: across on desktop, down the left on phones. */}
      <div aria-hidden="true" className="absolute top-0 bottom-0 left-[0.3125rem] w-px bg-(--ink)/15 lg:top-[0.3125rem] lg:right-0 lg:bottom-auto lg:left-0 lg:h-px lg:w-auto">
        <div className={`${s.track} h-full w-full bg-(--cobalt)`} />
      </div>
      <ol className="relative grid gap-8 pl-8 lg:grid-cols-5 lg:gap-6 lg:pl-0">
        {PLAN_STEPS.map((st, i) => (
          <li key={st.title} className={`${s.planStep} relative lg:pt-8`} style={{ '--delay': `${250 + i * 380}ms` } as React.CSSProperties}>
            <span aria-hidden="true" className={`absolute top-1 -left-8 h-[0.6875rem] w-[0.6875rem] rounded-full border-2 border-(--paper) lg:top-0 lg:left-0 ${st.kind === 'mastered' ? 'bg-(--mastery)' : 'bg-(--cobalt)'}`} />
            <p className={`${s.caps} text-(--ink)/65`}>{st.week}</p>
            <p className="mt-1 text-base font-semibold">{st.title}</p>
            <div className="mt-3">
              <Artefact kind={st.kind} />
            </div>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}
