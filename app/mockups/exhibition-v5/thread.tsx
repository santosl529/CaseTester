import { STORY, THREAD, type ThreadState } from './content';
import s from './exhibition.module.css';

// The story's thread (Matt, 23 Oct v3): Lorenzo's one weak spot, Math setup,
// carried through all six chapters. The same mark sits on everything that
// belongs to it (the slip, the workout row, the lesson, the drill, the report
// row, the skill chip), and the same pill climbs with him chapter by chapter.

// The thread's mark: a Cobalt dot in a Sky ring.
export function ThreadMark({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 flex-none rounded-full bg-(--cobalt) ring-[3px] ring-(--sky) ${className}`} />;
}

const PILL: Record<Exclude<ThreadState, 'none'>, { label: string; cls: string }> = {
  gap: { label: 'Gap found', cls: 'border-(--ink) bg-(--white) text-(--ink)' },
  focus: { label: 'Focus area', cls: 'border-(--sky) bg-(--sky) text-(--ink)' },
  learning: { label: 'Learning', cls: 'border-(--sky) bg-(--sky) text-(--ink)' },
  practiced: { label: 'Practiced', cls: 'border-(--cobalt) bg-(--cobalt) text-(--white)' },
  passed: { label: 'Passed in a new case', cls: 'border-(--mastery) bg-(--white) text-(--ink)' },
  mastered: { label: 'Mastered', cls: 'border-(--mastery) bg-(--mastery) text-(--ink)' },
};

export function ThreadPill({ state }: { state: ThreadState }) {
  if (state === 'none') return <span aria-hidden="true" className="t-label invisible inline-flex h-6 rounded-full border px-2.5" />;
  const { label, cls } = PILL[state];
  return (
    <span className={`t-label inline-flex h-6 flex-none items-center gap-2 rounded-full border px-2.5 font-semibold whitespace-nowrap transition-colors duration-700 ${cls}`}>
      <ThreadMark />{THREAD.skill} · {label}
    </span>
  );
}

// Desktop: above the pinned visual, the day, the beat in words, and the pill.
export function StoryStrip({ id, state }: { id: string; state: ThreadState }) {
  const beat = STORY[id];
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="t-label"><span className="font-semibold text-(--accent)">{beat.day}</span><span className="text-(--text-2)"> · {beat.left} · Sample student</span></p>
        <p className="t-small mt-0.5 font-medium">{beat.line}</p>
      </div>
      <ThreadPill state={state} />
    </div>
  );
}

// Phones: the beat in words flows with the chapter copy; only the day and
// the pill stay pinned above the visual.
export function StoryLine({ id }: { id: string }) {
  const beat = STORY[id];
  return (
    <div data-theme="light" className={`${s.quiet} mt-6 rounded-[10px] border border-(--ink)/12 bg-(--white) p-3`}>
      <p className="t-label flex items-center gap-2"><ThreadMark /><span className="font-semibold text-(--cobalt)">{THREAD.student}’s story · {beat.day}</span><span className="text-(--ink)/65">· {beat.left}</span></p>
      <p className="t-small mt-1 font-medium">{beat.line}</p>
      <p className="t-label mt-1 text-(--ink)/65">A sample student.</p>
    </div>
  );
}

export function StoryPinned({ id, state }: { id: string; state: ThreadState }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="t-label font-semibold text-(--accent)">{THREAD.student} · {STORY[id].day}</p>
      <ThreadPill state={state} />
    </div>
  );
}
