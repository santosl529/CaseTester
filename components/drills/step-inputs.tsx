'use client';
import { useId } from 'react';
import { parseNumericInput } from '@/lib/drills/numeric';

// Inputs for the D2 drills (docs/prd-drills.md "Item screen"). Word caps are
// enforced as the student types: typing past the cap is blocked, and a paste
// that runs over is cut at the cap.

export const countWords = (text: string) => (text.match(/\S+/g) ?? []).length;

// Keeps the first `cap` words, preserving the text's own spacing.
function capWords(text: string, cap: number): string {
  let words = 0;
  const out = text.replace(/\S+/g, w => (++words <= cap ? w : ''));
  return words <= cap ? text : out.replace(/\s+$/, '');
}

function WordCount({ count, cap, id }: { count: number; cap: number; id: string }) {
  return (
    <p id={id} aria-live="polite" className={`text-xs ${count >= cap ? 'text-destructive' : 'text-muted-foreground'}`}>
      {count} of {cap} words{count >= cap ? ': limit reached' : ''}
    </p>
  );
}

export function WrittenAnswer({ value, onChange, cap, label }: { value: string; onChange: (v: string) => void; cap: number; label: string }) {
  const id = useId();
  const count = countWords(value);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <textarea
        id={id} value={value} rows={5} autoFocus aria-describedby={`${id}-count`}
        className="w-full rounded-lg border bg-background p-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={e => {
          const next = e.target.value;
          // Block typing past the cap; cut an over-long paste at the cap.
          if (countWords(next) <= cap) onChange(next);
          else if (next.length - value.length > 1) onChange(capWords(next, cap));
        }}
      />
      <WordCount count={count} cap={cap} id={`${id}-count`} />
    </div>
  );
}

export interface Bucket { title: string; points: string[] }
export const PS3 = { maxBuckets: 5, maxPoints: 4, pointWords: 15 };

export function BucketsEditor({ value, onChange, cap }: { value: Bucket[]; onChange: (v: Bucket[]) => void; cap: number }) {
  const total = countWords(value.map(b => [b.title, ...b.points].join(' ')).join(' '));
  const id = useId();
  const set = (i: number, b: Bucket) => onChange(value.map((x, j) => (j === i ? b : x)));
  // A change is allowed if it keeps the framework under the total cap.
  const within = (next: Bucket[]) => countWords(next.map(b => [b.title, ...b.points].join(' ')).join(' ')) <= cap;
  return (
    <fieldset className="space-y-3" aria-describedby={`${id}-count`}>
      <legend className="text-sm font-medium">Your framework: 2–{PS3.maxBuckets} buckets, each with 1–{PS3.maxPoints} sub-points</legend>
      {value.map((b, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <input
              aria-label={`Bucket ${i + 1} title`} placeholder={`Bucket ${i + 1}`} value={b.title}
              className="flex-1 rounded-md border bg-background px-2 py-1 text-sm font-medium"
              onChange={e => { const next = value.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)); if (within(next)) onChange(next); }}
            />
            {value.length > 1 && (
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                Remove bucket
              </button>
            )}
          </div>
          {b.points.map((p, k) => (
            <div key={k} className="flex items-center gap-2 pl-4">
              <span aria-hidden="true" className="text-muted-foreground">•</span>
              <input
                aria-label={`Bucket ${i + 1}, sub-point ${k + 1}`} value={p} placeholder="A specific thing to look at"
                className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
                onChange={e => {
                  const text = e.target.value;
                  if (countWords(text) > PS3.pointWords) return;
                  const next = value.map((x, j) => (j === i ? { ...x, points: x.points.map((q, m) => (m === k ? text : q)) } : x));
                  if (within(next)) onChange(next);
                }}
              />
              {b.points.length > 1 && (
                <button type="button" aria-label={`Remove sub-point ${k + 1}`} className="text-xs text-muted-foreground" onClick={() => set(i, { ...b, points: b.points.filter((_, m) => m !== k) })}>✕</button>
              )}
            </div>
          ))}
          {b.points.length < PS3.maxPoints && (
            <button type="button" className="pl-4 text-xs underline" onClick={() => set(i, { ...b, points: [...b.points, ''] })}>Add a sub-point</button>
          )}
        </div>
      ))}
      {value.length < PS3.maxBuckets && (
        <button type="button" className="text-sm underline" onClick={() => onChange([...value, { title: '', points: [''] }])}>Add a bucket</button>
      )}
      <WordCount count={total} cap={cap} id={`${id}-count`} />
    </fieldset>
  );
}

export function ChoiceList({ name, choices, value, onChange, label }: {
  name: string; choices: { id: string; text: string }[]; value: string | null; onChange: (id: string) => void; label: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {choices.map(c => (
        <label key={c.id} className="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
          <input type="radio" name={name} checked={value === c.id} onChange={() => onChange(c.id)} />
          <span>{c.text}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function CardPicker({ cards, value, onChange, label }: {
  cards: { id: string; text: string }[]; value: string[]; onChange: (ids: string[]) => void; label: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {cards.map(c => (
        <label key={c.id} className="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
          <input type="checkbox" checked={value.includes(c.id)}
            onChange={e => onChange(e.target.checked ? [...value, c.id] : value.filter(x => x !== c.id))} />
          <span>{c.text}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function NumberFields({ fields, value, onChange, label }: {
  fields: { id: string; text: string }[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void; label: string;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      {fields.map(f => {
        const raw = value[f.id] ?? '';
        const parsed = raw.trim() ? parseNumericInput(raw) : null;
        return (
          <div key={f.id} className="space-y-1">
            <label htmlFor={`${id}-${f.id}`} className="block text-sm">{f.text}</label>
            <input
              id={`${id}-${f.id}`} value={raw} inputMode="decimal" autoComplete="off"
              className="w-full max-w-xs rounded-md border bg-background px-2 py-1 font-mono text-sm"
              aria-invalid={parsed?.ok === false || undefined}
              placeholder="e.g. 130M, 40% or 60"
              onChange={e => onChange({ ...value, [f.id]: e.target.value })}
            />
            {parsed?.ok === false && <p className="text-xs text-destructive">Enter a number</p>}
          </div>
        );
      })}
    </fieldset>
  );
}
