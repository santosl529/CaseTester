'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { drillFetch } from '@/lib/drills/client-fetch';

interface Check { id: string; grader: boolean; by: 'ai' | 'code'; evidence: string; label: boolean }
interface Flag { id: string; grader: boolean; label: boolean }

// One report in the review queue: Matt's label for each check and red flag
// (starting from the grader's verdict), a note, and the decision. Saving
// labels marks it "labeled", ready for npm run drills:export-disputes.
export function ReportReview({ id, status, notes, checks, flags, exported }: {
  id: string; status: string; notes: string; checks: Check[]; flags: Flag[]; exported: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [labels, setLabels] = useState(Object.fromEntries(checks.map(c => [c.id, c.label])));
  const [redFlags, setRedFlags] = useState(Object.fromEntries(flags.map(f => [f.id, f.label])));
  const [note, setNote] = useState(notes);
  const [msg, setMsg] = useState('');
  const graded = checks.length > 0;

  async function save(next: 'labeled' | 'resolved' | 'dismissed' | 'open') {
    setMsg('');
    const res = await drillFetch(`/api/drills/review/reports/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next, notes: note, ...(next === 'labeled' && { labels, red_flags: redFlags }) }),
    });
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).message ?? 'Could not save.'); return; }
    setMsg('Saved.');
    router.refresh();
  }

  const yn = (name: string, value: boolean, set: (v: boolean) => void, label: string) => (
    <span role="radiogroup" aria-label={label} className="inline-flex gap-1">
      {[true, false].map(v => (
        <label key={String(v)} className="t-label flex cursor-pointer items-center gap-1 rounded-full border border-ink/20 bg-white px-2.5 py-0.5 has-checked:border-cobalt has-checked:bg-sky/50 has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cobalt">
          <input type="radio" name={name} checked={value === v} onChange={() => set(v)} className="sr-only" />
          {v ? 'Y' : 'N'}
        </label>
      ))}
    </span>
  );

  return (
    <div className="space-y-3 border-t border-ink/10 pt-4">
      {graded && (
        <table className="w-full t-small">
          <caption className="sr-only">Grader verdicts and your labels</caption>
          <thead><tr className="text-left t-label text-ink/70"><th scope="col" className="pr-2">Check</th><th scope="col" className="pr-2">Grader</th><th scope="col">Your label</th></tr></thead>
          <tbody>
            {checks.map(c => (
              <tr key={c.id} className={labels[c.id] !== c.grader ? 'font-medium' : ''}>
                <th scope="row" className="py-1 pr-2 text-left font-normal [overflow-wrap:anywhere]">{c.id}{c.by === 'code' ? ' (code)' : ''}{c.evidence && <span className="block t-label text-ink/70">“{c.evidence}”</span>}</th>
                <td className="py-1 pr-2">{c.grader ? 'Y' : 'N'}</td>
                <td className="py-1">{yn(`${uid}-${c.id}`, labels[c.id], v => setLabels(l => ({ ...l, [c.id]: v })), `Your label for ${c.id}`)}</td>
              </tr>
            ))}
            {flags.map(f => (
              <tr key={f.id} className={redFlags[f.id] !== f.grader ? 'font-medium' : ''}>
                <th scope="row" className="py-1 pr-2 text-left font-normal [overflow-wrap:anywhere]">red flag: {f.id}</th>
                <td className="py-1 pr-2">{f.grader ? 'Y' : 'N'}</td>
                <td className="py-1">{yn(`${uid}-flag-${f.id}`, redFlags[f.id], v => setRedFlags(r => ({ ...r, [f.id]: v })), `Your label for red flag ${f.id}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="space-y-1">
        <label htmlFor={`${uid}-note`} className="t-small font-medium">Your notes</label>
        <textarea id={`${uid}-note`} rows={2} value={note} onChange={e => setNote(e.target.value)}
          className="w-full rounded-field border border-ink/20 bg-white p-3 t-small hover:border-ink/35 focus-visible:border-cobalt" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {graded && <Button size="sm" onClick={() => save('labeled')}>Save labels</Button>}
        <Button size="sm" variant={graded ? 'outline' : 'default'} onClick={() => save('resolved')}>Resolved</Button>
        <Button size="sm" variant="ghost" onClick={() => save('dismissed')}>Dismiss</Button>
        {status !== 'open' && <Button size="sm" variant="ghost" onClick={() => save('open')}>Reopen</Button>}
        <span role="status" className="t-label text-ink/70">{msg || (exported ? 'In the golden sets.' : '')}</span>
      </div>
    </div>
  );
}
