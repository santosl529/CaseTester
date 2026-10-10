'use client';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { DrillChart } from '@/components/drills/chart';
import { NumericInput } from '@/components/drills/numeric-input';
import { Timer } from '@/components/drills/timer';
import { BucketsEditor, CardPicker, ChoiceList, NumberFields, WrittenAnswer, type Bucket } from '@/components/drills/step-inputs';
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
  stage_limits_ms: number[];
  ai_graded: boolean;
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

type Step = NonNullable<PublicItem['input']['steps']>[number];

// One answer in progress, whatever the step's input.
interface Draft { choice: string | null; numeric: string; text: string; buckets: Bucket[]; cards: string[]; numbers: Record<string, string> }
const emptyDraft = (): Draft => ({ choice: null, numeric: '', text: '', buckets: [{ title: '', points: [''] }, { title: '', points: [''] }], cards: [], numbers: {} });

const DEFAULT_LABELS: Record<string, string> = {
  single_choice: 'Choose one', numeric: 'Your answer', free_text: 'Your answer',
  structured_buckets: 'Your framework', multi_select: 'Choose all that apply', numeric_set: 'Your numbers',
};

// Builds the response the server expects, or an error to show. A timed-out
// submit sends whatever is there, possibly nothing.
function responseFor(step: Step, draft: Draft, timedOut: boolean): { response: unknown } | { error: string } {
  switch (step.type) {
    case 'single_choice':
      if (draft.choice) return { response: { type: 'choice', option_id: draft.choice } };
      return timedOut ? { response: null } : { error: 'Choose an answer' };
    case 'multi_select':
      if (draft.cards.length) return { response: { type: 'choices', option_ids: draft.cards } };
      return timedOut ? { response: null } : { error: 'Pick at least one' };
    case 'numeric':
      if (draft.numeric.trim() && parseNumericInput(draft.numeric).ok) return { response: { type: 'numeric', value: draft.numeric } };
      return timedOut ? { response: null } : { error: 'Enter a number' };
    case 'numeric_set': {
      const filled = Object.values(draft.numbers).filter(v => v.trim());
      if (filled.some(v => !parseNumericInput(v).ok) && !timedOut) return { error: 'Enter a number for every driver' };
      return { response: { type: 'numbers', values: draft.numbers } };
    }
    case 'free_text':
      if (draft.text.trim()) return { response: { type: 'text', value: draft.text } };
      return timedOut ? { response: null } : { error: 'Write an answer first' };
    case 'structured_buckets': {
      const buckets = draft.buckets.map(b => ({ title: b.title.trim(), points: b.points.map(p => p.trim()).filter(Boolean) })).filter(b => b.title || b.points.length);
      if (buckets.length) return { response: { type: 'buckets', buckets } };
      return timedOut ? { response: null } : { error: 'Add at least one bucket' };
    }
    default:
      return { error: 'This input is not supported yet' };
  }
}

// One drill set, item by item (docs/prd-drills.md "Drill intro screen",
// "Item screen", "Feedback timing"). The server owns timing, order and keys;
// this screen shows them and submits.
export function DrillRunner({ view }: { view: RunnerView }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'intro' | 'item' | 'feedback' | 'finishing'>('intro');
  const [loaded, setLoaded] = useState<LoadedItem | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [limitMs, setLimitMs] = useState(0);
  const [steps, setSteps] = useState<StepFeedback[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [final, setFinal] = useState<ItemFeedback | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showExample, setShowExample] = useState(Boolean(view.example));
  const keys = useRef(new Map<string, string>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const patch = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }));

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
    setLimitMs(item.time_limit_ms);
    setSteps(item.completed_steps);
    setDraft(emptyDraft());
    setFinal(null);
    setPhase('item');
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [finish, view.set_id]);

  const stepSpecs: Step[] = loaded ? (loaded.item.input.steps ?? [{ type: loaded.item.input.type, weight: 1, max_words: loaded.item.input.max_words }]) : [];
  const stepIndex = steps.length;
  const current = stepSpecs[stepIndex];

  const submit = useCallback(async (opts: { skip?: boolean; timedOut?: boolean } = {}) => {
    if (!loaded || busy || phase !== 'item' || !current) return;
    let response: unknown = null;
    if (!opts.skip) {
      const built = responseFor(current, draft, Boolean(opts.timedOut));
      if ('error' in built) { setError(built.error); return; }
      response = built.response;
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
      // Next step of the same item. A new stage (HY-2) restarts the clock.
      setSteps(s => [...s, data.step as StepFeedback]);
      setDraft(emptyDraft());
      setDeadline(Date.now() + data.remaining_ms);
      setLimitMs(data.time_limit_ms);
      return;
    }
    setFinal(data as ItemFeedback);
    setPhase('feedback');
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [busy, current, draft, loadItem, loaded, phase, stepIndex, view.set_id]);

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
    const time = view.stage_limits_ms.map(ms => `${Math.round(ms / 1000)} s`).join(', then ');
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
          <li className="rounded-lg border p-3"><span className="block text-muted-foreground">Time per item</span><span className="font-medium">{time}</span></li>
          <li className="rounded-lg border p-3"><span className="block text-muted-foreground">Pass bar</span><span className="font-medium">{Math.round(view.pass_bar * 100)}%</span></li>
        </ul>
        {view.ai_graded && (
          <p className="text-sm text-muted-foreground">Your written answers are graded together after the last item, so there is no feedback until then.</p>
        )}
        {view.example && showExample && (
          <section aria-labelledby="example-heading" className="space-y-3 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-baseline justify-between">
              <h2 id="example-heading" className="text-sm font-medium">Worked example</h2>
              <Button variant="ghost" size="sm" onClick={skipExample}>Skip example</Button>
            </div>
            <p className="whitespace-pre-line text-sm">{view.example.prompt}</p>
            {view.example.exhibit && <DrillChart spec={view.example.exhibit as ChartSpec} />}
            {view.example.options.length > 0 && (
              <ul className="space-y-1 text-sm">
                {view.example.options.map(o => (
                  <li key={o.id} className={o.correct ? 'font-medium' : 'text-muted-foreground'}>{o.correct ? '✓ ' : '• '}{o.text}</li>
                ))}
              </ul>
            )}
            <p className="whitespace-pre-line text-sm"><span className="font-medium">Answer:</span> {view.example.answer}</p>
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
  const multi = stepSpecs.length > 1;
  const label = current ? `${multi ? `Step ${stepIndex + 1}: ` : ''}${current.label ?? DEFAULT_LABELS[current.type] ?? 'Your answer'}` : '';
  // QN-5: the driver cards the numbers step asks about, from step 1's feedback.
  const drivers = steps.find(s => s.drivers)?.drivers ?? [];
  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between text-sm text-muted-foreground">
        <span>{view.drill.name}</span>
        <span>Item {loaded.position + 1} of {loaded.size}</span>
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="whitespace-pre-line text-base font-medium leading-relaxed outline-none">{item.prompt}</h1>
      {item.exhibit && <DrillChart spec={item.exhibit} />}

      {phase === 'item' && (
        <Timer key={deadline} deadline={deadline} totalMs={limitMs} onExpire={() => submit({ timedOut: true })} />
      )}

      {/* Finished steps: auto-checked ones show their verdict (QN-4's formula
          before the calculation); AI-graded ones are just saved. */}
      {steps.map((s, i) => (
        <div key={i} className="space-y-1 rounded-lg border p-3 text-sm">
          {s.pending ? (
            <p className="font-medium">Step {i + 1}: saved</p>
          ) : (
            <>
              <p className="font-medium">Step {i + 1}: {s.correct ? 'Correct' : 'Not quite'}</p>
              {!s.correct && s.your_answer && <p>You answered: {s.your_answer}</p>}
              <p>{s.drivers ? 'Use these drivers' : 'Correct'}: <span className="font-medium">{s.correct_answer}</span></p>
              {s.feedback && <p className="text-muted-foreground">{s.feedback}</p>}
            </>
          )}
          {s.reveal && (
            <p className="rounded-md bg-muted p-2"><span className="font-medium">New fact:</span> {s.reveal}</p>
          )}
        </div>
      ))}

      {phase === 'item' && current && (
        <div>
          {current.type === 'single_choice' && (
            <ChoiceList name={`item-${loaded.position}-${stepIndex}`} label={label}
              choices={current.choices ?? item.options} value={draft.choice} onChange={choice => patch({ choice })} />
          )}
          {current.type === 'multi_select' && (
            <CardPicker label={label} cards={item.options} value={draft.cards} onChange={cards => patch({ cards })} />
          )}
          {current.type === 'numeric' && (
            <NumericInput value={draft.numeric} onChange={numeric => patch({ numeric })} onSubmit={() => submit()} label={label} />
          )}
          {current.type === 'numeric_set' && (
            <NumberFields label={label} fields={drivers} value={draft.numbers} onChange={numbers => patch({ numbers })} />
          )}
          {current.type === 'free_text' && (
            <WrittenAnswer label={label} cap={current.max_words ?? 120} value={draft.text} onChange={text => patch({ text })} />
          )}
          {current.type === 'structured_buckets' && (
            <BucketsEditor cap={item.input.max_words ?? 120} value={draft.buckets} onChange={buckets => patch({ buckets })} />
          )}
        </div>
      )}

      {phase === 'item' && (
        <div className="flex items-center gap-3">
          <Button onClick={() => submit()} disabled={busy}>{multi && stepIndex < stepSpecs.length - 1 ? 'Next step' : 'Submit'}</Button>
          <Button variant="ghost" onClick={() => submit({ skip: true })} disabled={busy}>Skip</Button>
        </div>
      )}

      {phase === 'feedback' && final && <ItemFeedbackPanel feedback={final} />}
      {phase === 'feedback' && (
        <Button size="lg" onClick={next} autoFocus>{loaded.position + 1 < loaded.size ? 'Next item' : 'See results'}</Button>
      )}
      {phase === 'finishing' && <p className="text-sm text-muted-foreground">{view.ai_graded ? 'Sending your answers for grading…' : 'Scoring your set…'}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

export function ItemFeedbackPanel({ feedback }: { feedback: ItemFeedback }) {
  if (feedback.pending) {
    return (
      <div role="status" className="space-y-1 rounded-lg border p-4 text-sm">
        <p className="font-medium">{feedback.skipped ? 'Skipped' : 'Answer saved'}</p>
        <p className="text-muted-foreground">Written answers are graded together after the last item.</p>
      </div>
    );
  }
  const verdict = feedback.skipped ? 'Skipped' : feedback.correct ? 'Correct' : feedback.score > 0 ? 'Partly correct' : feedback.timed_out ? 'Time ran out' : 'Not quite';
  if (feedback.grading) return <GradedPanel feedback={feedback} verdict={verdict} />;
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

// AI-graded items (PRD "Set results screen"): each check passed or failed,
// the quote that shows it, any red flag, and the model answer.
function GradedPanel({ feedback, verdict }: { feedback: ItemFeedback; verdict: string }) {
  const g = feedback.grading!;
  return (
    <div className="space-y-3 rounded-lg border p-4 text-sm">
      <p className="font-medium">{verdict} ({Math.round(feedback.score * 100)}%)</p>
      <ul className="space-y-2">
        {g.checks.map(c => (
          <li key={c.check_id} className="flex gap-2">
            <span aria-hidden="true" className={c.pass ? 'text-primary' : 'text-destructive'}>{c.pass ? '✓' : '✗'}</span>
            <span className="sr-only">{c.pass ? 'Passed:' : 'Missed:'}</span>
            <span className="space-y-0.5">
              <span className="block">{c.question}</span>
              {c.pass && c.evidence && <span className="block text-muted-foreground">You wrote: “{c.evidence}”</span>}
              {!c.pass && <span className="block text-muted-foreground">{c.feedback}</span>}
            </span>
          </li>
        ))}
      </ul>
      {g.decision && (
        <p>Your choice after the new fact: <span className="font-medium">{g.decision.chose}</span>, {g.decision.right ? 'the right call.' : 'not the right call for your hypothesis.'}</p>
      )}
      {g.red_flags.map(f => (
        <p key={f.id} className="rounded-md border border-destructive/60 p-2">
          <span className="font-medium">Red flag:</span> {f.definition}{f.evidence ? ` (“${f.evidence}”)` : ''} This caps the score.
        </p>
      ))}
      {g.model_answer && (
        <div className="space-y-1">
          <p className="font-medium">A strong answer</p>
          <p className="whitespace-pre-line text-muted-foreground">{g.model_answer}</p>
        </div>
      )}
      <p className="text-muted-foreground">{feedback.explanation}</p>
      {g.review_flagged && <p className="text-xs text-muted-foreground">Part of this grade has been flagged for a human check.</p>}
    </div>
  );
}
