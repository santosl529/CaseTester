'use client';
import { useId } from 'react';
import { parseNumericInput } from '@/lib/drills/numeric';
import { Input } from '@/components/ui/input';

// Numeric entry with the shared parser (docs/prd-drills.md "Numeric parsing"):
// shows how the entry reads ("= 2,500,000") so the student can catch a typo,
// and "Enter a number" when it can't be read.
export function NumericInput({ value, onChange, onSubmit, label }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; label: string;
}) {
  const id = useId();
  const parsed = value.trim() ? parseNumericInput(value) : null;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <Input
        id={id} value={value} autoFocus inputMode="decimal" autoComplete="off" className="max-w-xs font-mono"
        aria-describedby={`${id}-hint`} aria-invalid={parsed?.ok === false || undefined}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } }}
        placeholder="e.g. 2.5M, 2,500,000 or 25%"
      />
      <p id={`${id}-hint`} className={`text-xs ${parsed?.ok === false ? 'text-destructive' : 'text-muted-foreground'}`}>
        {parsed === null ? 'Numbers like 2.5M, $40k, 2,500,000 and 25% all work.'
          : parsed.ok ? `Reads as ${parsed.value.toLocaleString('en-US', { maximumFractionDigits: 6 })}${parsed.percent ? '%' : ''}`
          : 'Enter a number'}
      </p>
    </div>
  );
}
