'use client';
import { useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

// D6 pilot feedback (docs/prd-drills.md "Pilot feedback"): the feedback
// button, "Report a problem" and check-ins. Dialogs are native <dialog>s
// (focus moves in, Escape closes, focus returns to the button).

const COMMENT_MAX = 500;
const field = 'w-full rounded-md border bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
const choice = 'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50';

async function post(url: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data.message === 'string' ? data.message : 'Could not send. Please try again.';
  } catch {
    return 'Could not send. Check your connection and try again.';
  }
}

function Comment({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">{label} <span className="font-normal text-muted-foreground">(optional)</span></label>
      <textarea id={id} rows={3} maxLength={COMMENT_MAX} value={value} onChange={e => onChange(e.target.value)} aria-describedby={`${id}-count`} className={field} />
      <p id={`${id}-count`} className="text-xs text-muted-foreground">{value.length} of {COMMENT_MAX} characters</p>
    </div>
  );
}

// A modal with a title, a form and Cancel / Send; shows "Thanks" once sent.
function FeedbackDialog({ dialogRef, title, children, onSend, canSend, reset }: {
  dialogRef: React.RefObject<HTMLDialogElement | null>; title: string; children: React.ReactNode;
  onSend: () => Promise<string | null>; canSend: boolean; reset: () => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const close = () => {
    dialogRef.current?.close();
    setSent(false);
    setError('');
    reset();
  };
  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} onClose={() => { setSent(false); setError(''); }}
      className="m-auto w-[min(92vw,28rem)] rounded-lg border bg-background p-0 text-foreground backdrop:bg-black/40">
      <div className="space-y-4 p-4">
        <h2 id={titleId} className="text-base font-semibold">{title}</h2>
        {sent ? (
          <>
            <p role="status" className="text-sm">Thanks! We read every message.</p>
            <div className="flex justify-end"><Button autoFocus onClick={close}>Close</Button></div>
          </>
        ) : (
          <form className="space-y-4" onSubmit={async e => {
            e.preventDefault();
            if (!canSend || busy) return;
            setBusy(true);
            const problem = await onSend();
            setBusy(false);
            if (problem) setError(problem);
            else setSent(true);
          }}>
            {children}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={!canSend || busy}>{busy ? 'Sending…' : 'Send'}</Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

// ------------------------------------------------------------ feedback button

const CATEGORIES = [
  { id: 'broken', label: "Something's broken" },
  { id: 'confusing', label: "Something's confusing" },
  { id: 'idea', label: 'Idea' },
] as const;

// On every drills page, fixed in the bottom-right corner (the drills layout
// leaves room under the content so it never hides the end of a page).
export function FeedbackButton() {
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<string>('');
  const [text, setText] = useState('');
  const id = useId();
  const setId = /^\/drills\/sets\/([0-9a-f-]{36})/.exec(pathname)?.[1];
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} aria-label="Feedback"
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex size-11 items-center justify-center gap-2 rounded-full border bg-background text-sm font-medium shadow-md hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-auto sm:px-4 sm:py-2">
        <MessageSquare aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>
      <FeedbackDialog dialogRef={ref} title="Send feedback" canSend={category !== ''} reset={() => { setCategory(''); setText(''); }}
        onSend={() => post('/api/drills/feedback', {
          category, comment: text, page: pathname, set_id: setId,
          device: `${navigator.userAgent.slice(0, 240)} · ${window.innerWidth}×${window.innerHeight}`,
        })}>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">What is it about?</legend>
          {CATEGORIES.map(c => (
            <label key={c.id} className={choice}>
              <input type="radio" name={`${id}-category`} value={c.id} checked={category === c.id} onChange={() => setCategory(c.id)} />
              {c.label}
            </label>
          ))}
        </fieldset>
        <Comment id={`${id}-comment`} value={text} onChange={setText} label="Tell us more" />
        <p className="text-xs text-muted-foreground">We attach this page and your device, so you don&apos;t need to describe them.</p>
      </FeedbackDialog>
    </>
  );
}

// ---------------------------------------------------------- report a problem

const REASONS = [
  { id: 'answer_key_wrong', label: 'Answer key is wrong' },
  { id: 'question_confusing', label: 'Question is confusing' },
  { id: 'grade_unfair', label: 'My grade seems unfair' },
  { id: 'other', label: 'Other' },
] as const;

// On every item and results screen, for the item at `position`.
export function ReportProblem({ setId, position, screen }: { setId: string; position: number; screen: 'item' | 'results' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<string>('');
  const [text, setText] = useState('');
  const id = useId();
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()}
        className="rounded-sm text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        Report a problem
      </button>
      <FeedbackDialog dialogRef={ref} title={`Report a problem with item ${position + 1}`} canSend={reason !== ''}
        reset={() => { setReason(''); setText(''); }}
        onSend={() => post(`/api/drills/sets/${setId}/reports`, { position, reason, comment: text, screen })}>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">What&apos;s wrong?</legend>
          {REASONS.map(r => (
            <label key={r.id} className={choice}>
              <input type="radio" name={`${id}-reason`} value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <Comment id={`${id}-comment`} value={text} onChange={setText} label="Tell us more" />
        {reason === 'grade_unfair' && <p className="text-xs text-muted-foreground">We review every disputed grade. It won&apos;t change your score now, but it helps us fix the grader.</p>}
      </FeedbackDialog>
    </>
  );
}

// ------------------------------------------------------------------ check-ins

const QUESTION = {
  set_usefulness: 'How useful was today’s practice?',
  first_case: 'You finished your first full case. What would make this more useful?',
  week_1: 'You’ve finished your first week. What would make this more useful?',
} as const;

// Inline on the results page (usefulness) or the training home (the open
// questions). "Not now" dismisses it for good.
export function CheckIn({ id, kind }: { id: string; kind: keyof typeof QUESTION }) {
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [state, setState] = useState<'open' | 'busy' | 'sent' | 'dismissed'>('open');
  const [error, setError] = useState('');
  const uid = useId();
  const usefulness = kind === 'set_usefulness';
  const send = async (body: object, done: 'sent' | 'dismissed') => {
    setState('busy');
    const problem = await post(`/api/drills/checkins/${id}`, body);
    if (problem) { setError(problem); setState('open'); } else setState(done);
  };
  if (state === 'dismissed') return null;
  if (state === 'sent') return <p role="status" className="rounded-lg border p-4 text-sm">Thanks for telling us.</p>;
  return (
    <section aria-labelledby={`${uid}-q`} className="space-y-3 rounded-lg border p-4">
      <h2 id={`${uid}-q`} className="text-sm font-medium">{QUESTION[kind]}</h2>
      <form className="space-y-3" onSubmit={e => {
        e.preventDefault();
        void send({ action: 'answer', rating: rating ?? undefined, comment: text }, 'sent');
      }}>
        {usefulness && (
          <fieldset>
            <legend className="sr-only">Rating from 1 (not useful) to 5 (very useful)</legend>
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden="true" className="text-xs text-muted-foreground">Not useful</span>
              {[1, 2, 3, 4, 5].map(n => (
                <label key={n} className={`${choice} px-3`}>
                  <input type="radio" name={`${uid}-rating`} value={n} checked={rating === n} onChange={() => setRating(n)}
                    aria-label={n === 1 ? '1, not useful' : n === 5 ? '5, very useful' : String(n)} />
                  <span aria-hidden="true">{n}</span>
                </label>
              ))}
              <span aria-hidden="true" className="text-xs text-muted-foreground">Very useful</span>
            </div>
          </fieldset>
        )}
        {usefulness
          ? <Comment id={`${uid}-why`} value={text} onChange={setText} label="Why?" />
          : (
            <div className="space-y-1">
              <label htmlFor={`${uid}-answer`} className="sr-only">Your answer</label>
              <textarea id={`${uid}-answer`} rows={3} maxLength={COMMENT_MAX} value={text} onChange={e => setText(e.target.value)} className={field} />
            </div>
          )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={state === 'busy' || (usefulness ? rating === null : !text.trim())}>Send</Button>
          <Button type="button" size="sm" variant="ghost" disabled={state === 'busy'} onClick={() => void send({ action: 'dismiss' }, 'dismissed')}>Not now</Button>
        </div>
      </form>
    </section>
  );
}
