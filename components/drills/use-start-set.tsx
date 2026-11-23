'use client';
// Every Start / Practice / Try it / Retry button starts its set through this hook (Matt, 21 Nov: clicking a drill starts
// that drill). While another set is unfinished the server refuses with that set and the drill this click would start;
// the hook then asks: Resume the unfinished set, or set it aside and start this one ("Start … instead"; its answers are
// kept and Today or the workout picks it up). It never opens a different set without asking.
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { drillFetch } from '@/lib/drills/client-fetch';

import { UNFINISHED_TITLE, insteadLabel, resumeLabel, unfinishedLine, unfinishedNote, type Unfinished } from '@/lib/drills/unfinished-text';
import { KindTag } from './kind-tag';
export { UNFINISHED_TITLE, insteadLabel, resumeLabel, unfinishedLine, unfinishedNote, type Unfinished };

// The 409 names the unfinished set (lib/drills/sets/service.ts unfinishedError).
export function isUnfinished(data: unknown): data is Unfinished {
  const d = data as Partial<Unfinished> & { error?: string };
  return d?.error === 'set_in_progress' && typeof d.set_id === 'string' && typeof d.drill_name === 'string' && typeof d.wanted?.drill_name === 'string';
}

// What a start request's answer means: open the set it names, ask (another set is unfinished), or show an error.
export type StartOutcome = { kind: 'open'; set_id: string } | { kind: 'ask'; unfinished: Unfinished } | { kind: 'error'; message: string };
export function startOutcome(ok: boolean, data: unknown, fallback: string): StartOutcome {
  const d = (data ?? {}) as { set_id?: unknown; message?: unknown };
  if (ok && typeof d.set_id === 'string') return { kind: 'open', set_id: d.set_id };
  if (isUnfinished(data)) return { kind: 'ask', unfinished: data };
  return { kind: 'error', message: typeof d.message === 'string' ? d.message : fallback };
}

export function useStartSet(fallback = 'Could not start the set.') {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // A second click can land before the disabled state renders.
  const running = useRef(false);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<{ unfinished: Unfinished; body: Record<string, unknown> } | null>(null);
  const [choiceError, setChoiceError] = useState('');
  // The button that asked: Cancel puts focus back on it (it was disabled while the request ran, so the dialog's own
  // focus return finds nothing to go back to).
  const trigger = useRef<HTMLElement | null>(null);

  async function post(body: Record<string, unknown>, inDialog: boolean) {
    if (running.current) return;
    running.current = true;
    if (!inDialog && typeof document !== 'undefined') trigger.current = document.activeElement as HTMLElement | null;
    setBusy(true);
    setError('');
    setChoiceError('');
    try {
      const res = await drillFetch('/api/drills/sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = startOutcome(res.ok, await res.json().catch(() => ({})), fallback);
      if (out.kind === 'open') router.push(`/drills/sets/${out.set_id}`);
      else if (out.kind === 'ask') setChoice({ unfinished: out.unfinished, body: { ...body, set_aside: undefined } });
      else if (inDialog) setChoiceError(out.message);
      else setError(out.message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const dialog = choice && (
    <UnfinishedSetDialog unfinished={choice.unfinished} busy={busy} error={choiceError}
      onResume={() => router.push(`/drills/sets/${choice.unfinished.set_id}`)}
      onInstead={() => post({ ...choice.body, set_aside: choice.unfinished.set_id }, true)}
      onCancel={() => { setChoice(null); setChoiceError(''); requestAnimationFrame(() => trigger.current?.focus()); }} />
  );
  return { start: (body: Record<string, unknown>) => post(body, false), busy, error, dialog };
}

export function UnfinishedSetDialog({ unfinished, busy, error, onResume, onInstead, onCancel }: {
  unfinished: Unfinished; busy: boolean; error: string; onResume: () => void; onInstead: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={`${id}-title`} aria-describedby={`${id}-body ${id}-note`} onClose={onCancel}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-panel border border-ink/12 bg-white p-6 text-ink shadow-panel backdrop:bg-ink/40">
      <h2 id={`${id}-title`} className="t-heading font-semibold">{UNFINISHED_TITLE}</h2>
      <p id={`${id}-body`} className="t-body mt-3 font-semibold tabular-nums"><KindTag kind="drill" />{unfinishedLine(unfinished)}</p>
      <p id={`${id}-note`} className="t-small mt-1 text-ink/70">{unfinishedNote(unfinished)}</p>
      {error && <p role="alert" className="t-small mt-3 text-alert">{error}</p>}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button onClick={onResume} disabled={busy}>{resumeLabel(unfinished)}</Button>
        <Button variant="outline" onClick={onInstead} disabled={busy}>{insteadLabel(unfinished)}</Button>
        <Button variant="ghost" onClick={() => ref.current?.close()} disabled={busy}>Cancel</Button>
      </div>
    </dialog>
  );
}
