'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { drillFetch } from '@/lib/drills/client-fetch';

export interface ReviewPoint {
  id: string; group: string; rating: string | null; point: string; quotes: string[];
  tag: string | null; tagName: string; reason: string; drill: boolean; severity: string | null; note: string | null;
}
export interface ReviewRun {
  sessionId: string; caseTitle: string; createdAt: string; mode: string; status: string; error: string | null; costUsd: number | null;
  findings: { name: string; severity: string; evidence: string }[];
  prescriptions: { skill: string; reason: string }[];
  observed: string[];
  points: ReviewPoint[];
  checker: { span: string; errorType: string | null; name: string; resolved: boolean; note: string | null }[];
  labels: Record<string, string | null>;
  read: boolean;
}
export interface TagOption { id: string; name: string }

// The shadow review page (Matt, 15 Nov, D11; local development only): each
// graded case's tagged points — every group, also those switched off — the
// findings and prescriptions it would make, and a label per point. Labels
// follow the written rules; a switched-off group goes on only after its gate
// passes with the labeled points added (scripts/case-tagging/gate.ts --with-shadow).
export function CaseTagReviewScreen({ runs, tags, read, since }: { runs: ReviewRun[]; tags: TagOption[]; read: number; since: string | null }) {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="t-title">Case tags: shadow review</h1>
        <p className="t-body text-ink/80">
          {read} of 20 real reports read (every point labeled).{since && ` Shadow since ${since}; it ends at 20 reports or two weeks, whichever comes first.`}
        </p>
        <p className="t-small text-ink/70">Label each point by the written rules (lib/scoring/skill-tag-rules.ts), not by the tagger&apos;s answer. Groups switched off show “no drill”.</p>
      </header>
      {runs.length === 0 && <p className="t-body">No graded cases yet. Set CASE_TO_DRILLS=shadow and grade a case.</p>}
      {runs.map(r => <RunCard key={r.sessionId} run={r} tags={tags} />)}
    </main>
  );
}

function RunCard({ run, tags }: { run: ReviewRun; tags: TagOption[] }) {
  const router = useRouter();
  const [labels, setLabels] = useState<Record<string, string | null>>(
    Object.fromEntries(run.points.map(p => [p.id, p.id in run.labels ? run.labels[p.id] : p.tag])));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true); setMsg('');
    const res = await drillFetch(`/api/drills/review/case-tags/${run.sessionId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels }),
    });
    setBusy(false);
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).message ?? 'Could not save.'); return; }
    setMsg('Saved.');
    router.refresh();
  }

  return (
    <section aria-labelledby={`run-${run.sessionId}`} className="space-y-4 rounded-panel border border-ink/12 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`run-${run.sessionId}`} className="t-heading font-semibold">{run.caseTitle}</h2>
        <p className="t-small text-ink/70">{run.createdAt} · {run.mode} · {run.status}{run.costUsd !== null && ` · $${run.costUsd.toFixed(3)}`}{run.read && ' · read'}</p>
      </div>
      {run.error && <p role="status" className="t-small text-alert">{run.error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <h3 className="t-label font-semibold">Prescriptions it would make</h3>
          {run.prescriptions.length === 0 ? <p className="t-small text-ink/70">None.</p> : (
            <ol className="t-small list-decimal space-y-1 pl-5">{run.prescriptions.map((p, i) => <li key={i}><b>{p.skill}</b>: {p.reason}</li>)}</ol>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="t-label font-semibold">Findings sent ({run.findings.length})</h3>
          <ul className="t-small space-y-1">{run.findings.map((f, i) => <li key={i}>{f.name} · {f.severity} · “{f.evidence}”</li>)}</ul>
          <p className="t-label text-ink/70">Observed: {run.observed.join(', ') || 'none'}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full t-small">
          <caption className="sr-only">Tagged points and your labels</caption>
          <thead><tr className="text-left t-label text-ink/70"><th scope="col" className="pr-3">Point</th><th scope="col" className="pr-3">Tagger</th><th scope="col">Your label</th></tr></thead>
          <tbody>
            {run.points.map(p => {
              const differs = (labels[p.id] ?? null) !== p.tag;
              return (
                <tr key={p.id} className="border-t border-ink/10 align-top">
                  <th scope="row" className="py-2 pr-3 text-left font-normal [overflow-wrap:anywhere]">
                    <span className="t-label text-ink/70">{p.group}{p.rating ? ` · ${p.rating}` : ''}{p.drill ? '' : ' · no drill (group off)'}</span>
                    <span className="block">{p.point}</span>
                    {p.quotes.map((q, i) => <span key={i} className="block text-ink/70">“{q}”</span>)}
                  </th>
                  <td className="py-2 pr-3">
                    <span className="font-medium">{p.tagName}</span>{p.severity && ` · ${p.severity}`}
                    <span className="block text-ink/70">{p.reason}</span>
                    {p.note && <span className="block t-label text-ink/70">{p.note}</span>}
                  </td>
                  <td className={`py-2 ${differs ? 'font-semibold' : ''}`}>
                    <label className="sr-only" htmlFor={`${run.sessionId}-${p.id}`}>Your label for this point</label>
                    <select id={`${run.sessionId}-${p.id}`} value={labels[p.id] ?? ''} onChange={e => setLabels(l => ({ ...l, [p.id]: e.target.value || null }))}
                      className="max-w-56 rounded-window border border-ink/20 bg-white px-2 py-1">
                      <option value="">No tag</option>
                      {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {run.checker.length > 0 && (
        <div className="space-y-1">
          <h3 className="t-label font-semibold">Math checker (code)</h3>
          <ul className="t-small space-y-1">{run.checker.map((c, i) => <li key={i}>“{c.span}” · {c.errorType ?? 'error'} → {c.name}{c.resolved ? ' · put right (minor)' : ''}{c.note ? ` · ${c.note}` : ''}</li>)}</ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save labels'}</Button>
        <span role="status" className="t-small text-ink/70">{msg}</span>
      </div>
    </section>
  );
}
