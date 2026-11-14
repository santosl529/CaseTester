'use client';
import { useId, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Browse drills' two views (Matt, 13 Nov): By drill (default) and By skill,
// as tabs (arrows, Home and End move between them) whose choice is in the
// address (?view=skill), so a link can open either. A lesson's links to a
// drill (#drill-…) carry no view, so they land on By drill.
type View = 'drill' | 'skill';
const TABS: { id: View; label: string }[] = [{ id: 'drill', label: 'By drill' }, { id: 'skill', label: 'By skill' }];

export function BrowseTabs({ byDrill, bySkill }: { byDrill: React.ReactNode; bySkill: React.ReactNode }) {
  const params = useSearchParams();
  const [view, setView] = useState<View>(params?.get('view') === 'skill' ? 'skill' : 'drill');
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (v: View, focus = false) => {
    setView(v);
    const url = new URL(location.href);
    if (v === 'skill') url.searchParams.set('view', 'skill'); else url.searchParams.delete('view');
    history.replaceState(history.state, '', url);
    if (focus) tabs.current[TABS.findIndex(t => t.id === v)]?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const at = TABS.findIndex(t => t.id === view);
    const to = e.key === 'ArrowRight' ? (at + 1) % TABS.length : e.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    choose(TABS[to].id, true);
  };

  return (
    <div className="space-y-8">
      <div role="tablist" aria-label="Browse drills" onKeyDown={onKey} className="flex gap-1 overflow-x-auto border-b border-ink/12">
        {TABS.map((t, i) => (
          <button key={t.id} ref={el => { tabs.current[i] = el; }} type="button" role="tab" id={`${id}-${t.id}`} aria-selected={view === t.id}
            aria-controls={`${id}-${t.id}-panel`} tabIndex={view === t.id ? 0 : -1} onClick={() => choose(t.id)}
            className="t-small -mb-px cursor-pointer whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-ink/70 transition-colors hover:text-ink aria-selected:border-cobalt aria-selected:font-semibold aria-selected:text-ink motion-reduce:transition-none">
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-drill-panel`} aria-labelledby={`${id}-drill`} hidden={view !== 'drill'} tabIndex={0} className="space-y-12 focus-visible:outline-offset-4">{byDrill}</div>
      <div role="tabpanel" id={`${id}-skill-panel`} aria-labelledby={`${id}-skill`} hidden={view !== 'skill'} tabIndex={0} className="space-y-4 focus-visible:outline-offset-4">{bySkill}</div>
    </div>
  );
}
