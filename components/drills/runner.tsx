'use client';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { DrillChart } from '@/components/drills/chart';
import { NumericInput } from '@/components/drills/numeric-input';
import { Timer } from '@/components/drills/timer';
import { parseNumericInput } from '@/lib/drills/numeric';
import type { ChartSpec } from '@/lib/drills/chart-spec';
import type { PublicItem } from '@/lib/drills/public-item';
import type { ItemFeedback, StepFeedback, WorkedExample } from '@/lib/drills/sets/service';

export interface RunnerView {
  set_id: string;
  position: number;
  size: number;
  drill: { id: string; name: string; level: number };
  skills: { id: string; name: string }[];
  focus_skill: string | null;
  time_limit_ms: number;
  pass_bar: number;
  example: WorkedExample | null;
}

interface LoadedItem {
  position: number;
  size: number;
  item: PublicItem;
  time_limit_ms: number;
  remaining_ms: number;
  completed_steps: StepFeedback[];
}

const STEP_LABELS: Record<string, string> = {
  single_choice: 'Choose one',
  numeric: 'Your answer',
};

// One drill set, item by item (docs/prd-drills.md "Drill intro screen",
// "Item screen", "Feedback timing"). The server owns timing, order and keys;
// this screen shows them and submits.
export function DrillRunner({ view }: { view: RunnerView }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'intro' | 'item' | 'feedback' | 'finishing'>('intro');
  const [loaded, setLoaded] = useState<LoadedItem | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [steps, setSteps] = useState<StepFeedback[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const [numeric, setNumeric] = useState('');
  const [final, setFinal] = useState<ItemFeedback | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showExample, setShowExample] = useState(Boolean(view.example));
  const keys = useRef(new Map<string, string>());
  const headingRef = useRef<HTMLHeadingElement>(null);

  // One idempotency key per item step, reused on retries of the same submit.
  const keyFor = (slot: string) => {
    if (!keys.current.has(slot)) keys.current.set(slot, crypto.randomUUID());
    return keys.current.get(slot)!;
  };

  const finish = useCallback(async () => {
    setPhase('finishing');
    const res = await fetch(`/api/drills/sets/${view.set_id}/complete`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? 'Could not finish the set.');
      return;
    }
    router.push(`/drills/sets/${view.set_id}/results`);
  }, [router, view.set_id]);

  const loadItem = useCallback(async (requested: number) => {
    setError('');
    // If the server says another position is current (a second tab, a
    // retried submit), follow it once.
    let position = requested;
    let res: Response | null = null;
    let data: Record<string, unknown> = {};
    for (let tries = 0; tries < 2; tries++) {
      res = await fetch(`/api/drills/sets/${view.set_id}/items/${position}`);
      data = await res.json().catch(() => ({}));
      if (res.ok || data.error !== 'out_of_order' || typeof data.position !== 'number' || data.position === position) break;
      position = data.position;
    }
    if (!res?.ok) {
      if (data.error === 'set_finished') return finish();
      setError(typeof data.message === 'string' ? data.message : 'Could not load the item.');
      return;
    }
    const item = data as unknown as LoadedItem;
    setLoaded(item);
    setDeadline(Date.now() + item.remaining_ms);
    setSteps(item.completed_steps);
    setChoice(null);
    setNumeric('');
    setFinal(null);
    setPhase('item');
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [finish, view.set_id]);

  const stepTypes = loaded ? (loaded.item.input.steps?.map(s => s.type) ?? [loaded.item.input.type]) : [];
  const stepIndex = steps.length;
  const currentType = stepTypes[stepIndex];

  const submit = useCallback(async (opts: { skip?: boolean; timedOut?: boolean } = {}) => {
    if (!loaded || busy || phase !== 'item') return;
    let response: unknown = null;
    if (!opts.skip) {
      if (currentType === 'single_choice' && choice) response = { type: 'choice', option_id: choice };
      if (currentType === 'numeric' && numeric.trim()) {
        if (parseNumericInput(numeric).ok) response = { type: 'numeric', value: numeric };
        else if (!opts.timedOut) { setError('Enter a number'); return; }
      }
      if (!response && !opts.timedOut) { setError(currentType === 'numeric' ? 'Enter a number' : 'Choose an answer'); return; }
    }
    setBusy(true);
    setError('');
    const slot = `${loaded.position}:${opts.skip ? 'skip' : stepIndex}`;
    const res = await fetch(`/api/drills/sets/${view.set_id}/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: loaded.position, idempotency_key: keyFor(slot), step: stepIndex,
        response, skip: Boolean(opts.skip), timed_out: Boolean(opts.timedOut),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (data.error === 'out_of_order' && typeof data.position === 'number') return loadItem(data.position);
      setError(data.message ?? 'Could not submit. Please try again.');
      return;
    }
    if (data.done === false) {
      setSteps(s => [...s, data.step as StepFeedback]);
      return;
    }
    setFinal(data as ItemFeedback);
    setPhase('feedback');
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [busy, choice, currentType, loadItem, loaded, numeric, phase, stepIndex, view.set_id]);

  const next = () => {
    if (!loaded) return;
    if (loaded.position + 1 < loaded.size) loadItem(loaded.position + 1);
    else finish();
  };

  async function skipExample() {
    setShowExample(false);
    await fetch('/api/me/drill-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skip_example_for: view.drill.id }),
    });
  }

  if (phase === 'intro') {
    const seconds = Math.round(view.time_limit_ms / 1000);
    return (
      <section className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{view.drill.name}</h1>
          <p className="text-sm text-muted-foreground">
            Trains {view.skills.map(s => s.name).join(', ')}.
            {view.focus_skill && view.skills.length > 1 && ` You chose to practice ${view.focus_skill}.`}
          </p>
        </div>
        <ul className="grid grid-cols-3 gap-3 text-sm">
          <li className="rounded-lg border p-3"><span className="block text-muted-foreground">Items</span><span className="font-medium">{view.size}</span></li>
          <li className="rounded-lg border p-3"><span className="block text-muted-foreground">Time per item</span><span className="font-medium">{seconds} s</span></li>
          <li className="rounded-lg border p-3"><span className="block text-muted-foreground">Pass bar</span><span className="font-medium">{Math.round(view.pass_bar * 100)}%</span></li>
        </ul>
        {view.example && showExample && (
          <section aria-labelledby="example-heading" className="space-y-3 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-baseline justify-between">
              <h2 id="example-heading" className="text-sm font-medium">Worked example</h2>
              <Button variant="ghost" size="sm" onClick={skipExample}>Skip example</Button>
            </div>
            <p className="text-sm">{view.example.prompt}</p>
            {view.example.exhibit && <DrillChart spec={view.example.exhibit as ChartSpec} />}
            {view.example.options.length > 0 && (
              <ul className="space-y-1 text-sm">
                {view.example.options.map(o => (
                  <li key={o.id} className={o.correct ? 'font-medium' : 'text-muted-foreground'}>{o.correct ? '✓ ' : '• '}{o.text}</li>
                ))}
              </ul>
            )}
            <p className="text-sm"><span className="font-medium">Answer:</span> {view.example.answer}</p>
            <p className="text-sm text-muted-foreground">{view.example.explanation}</p>
          </section>
        )}
        <Button size="lg" onClick={() => loadItem(view.position)}>{view.position > 0 ? 'Resume' : 'Start'}</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">{error || 'Loading…'}</p>;
  }

  const { item } = loaded;
  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between text-sm text-muted-foreground">
        <span>{view.drill.name}</span>
        <span>Item {loaded.position + 1} of {loaded.size}</span>
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="text-base font-medium leading-relaxed outline-none">{item.prompt}</h1>
      {item.exhibit && <DrillChart spec={item.exhibit} />}

      {phase === 'item' && (
        <Timer deadline={deadline} totalMs={loaded.time_limit_ms} onExpire={() => submit({ timedOut: true })} />
      )}

      {/* Finished steps of a multi-step item (QN-4: the correct formula is shown before the calculation). */}
      {steps.map((s, i) => (
        <div key={i} className="space-y-1 rounded-lg border p-3 text-sm">
          <p className="font-medium">Step {i + 1}: {s.correct ? 'Correct' : 'Not quite'}</p>
          {!s.correct && s.your_answer && <p>You chose: {s.your_answer}</p>}
          <p>Correct: <span className="font-medium">{s.correct_answer}</span></p>
          {s.feedback && <p className="text-muted-foreground">{s.feedback}</p>}
        </div>
      ))}

      {phase === 'item' && currentType === 'single_choice' && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{stepTypes.length > 1 ? `Step ${stepIndex + 1}: which calculation is right?` : STEP_LABELS.single_choice}</legend>
          {item.options.map(o => (
            <label key={o.id} className="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
              <input type="radio" name={`item-${loaded.position}`} checked={choice === o.id} onChange={() => setChoice(o.id)} />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      )}
      {phase === 'item' && currentType === 'numeric' && (
        <NumericInput value={numeric} onChange={setNumeric} onSubmit={() => submit()}
          label={stepTypes.length > 1 ? `Step ${stepIndex + 1}: now calculate it` : STEP_LABELS.numeric} />
      )}

      {phase === 'item' && (
        <div className="flex items-center gap-3">
          <Button onClick={() => submit()} disabled={busy}>Submit</Button>
          <Button variant="ghost" onClick={() => submit({ skip: true })} disabled={busy}>Skip</Button>
        </div>
      )}

      {phase === 'feedback' && final && <ItemFeedbackPanel feedback={final} />}
      {phase === 'feedback' && (
        <Button size="lg" onClick={next} autoFocus>{loaded.position + 1 < loaded.size ? 'Next item' : 'See results'}</Button>
      )}
      {phase === 'finishing' && <p className="text-sm text-muted-foreground">Scoring your set…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

export function ItemFeedbackPanel({ feedback }: { feedback: ItemFeedback }) {
  const verdict = feedback.skipped ? 'Skipped' : feedback.correct ? 'Correct' : feedback.score > 0 ? 'Partly correct' : feedback.timed_out ? 'Time ran out' : 'Not quite';
  return (
    <div role="status" className={`space-y-2 rounded-lg border p-4 text-sm ${feedback.correct ? 'border-primary' : 'border-destructive/60'}`}>
      <p className="font-medium">{verdict}{feedback.score > 0 && feedback.score < 1 ? ` (${Math.round(feedback.score * 100)}%)` : ''}</p>
      {feedback.steps.map((s, i) => (
        <div key={i} className="space-y-0.5">
          {feedback.steps.length > 1 && <p className="text-muted-foreground">Step {i + 1}</p>}
          {s.your_answer !== null && !s.correct && <p>Your answer: {s.your_answer}</p>}
          <p>Correct answer: <span className="font-medium">{s.correct_answer}</span></p>
          {!s.correct && s.feedback && <p>{s.feedback}</p>}
        </div>
      ))}
      <p className="text-muted-foreground"><span className="font-medium text-foreground">Worked solution:</span> {feedback.explanation}</p>
    </div>
  );
}
