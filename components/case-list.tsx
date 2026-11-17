'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/site/fetch-json';
import { StartCaseButton } from '@/components/start-case-button';
import { limitMessage } from '@/lib/site/limit-message';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CaseMode } from '@/lib/site/case-href';
import type { PastSession } from '@/lib/site/past-sessions';

const DIFFICULTY = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;
export const RECOMMENDED_LABEL = 'Recommended for you';
const TYPE_LABEL = (t: string) => (t === 'm_and_a' ? 'M&A' : t[0].toUpperCase() + t.slice(1).replace(/_/g, ' '));

export interface CaseCard {
  id: string; title: string; difficulty: keyof typeof DIFFICULTY; caseType?: string; minutes: number;
  // Finished attempts and the latest one (lib/site/past-sessions.ts caseAttemptRows).
  done: number; last: string | null;
  // "Good first case" (FIRST_CASE_ID).
  first?: boolean;
  // "Recommended for you": the case Today's Next case card linked to (17 Nov, M1). Shown instead of "Good first case".
  recommended?: boolean;
}
export interface CasesLeft { n: number; scope: 'day' | 'month' | 'site'; perDay: number; block: { reason: string; limit: number; retryAt: string } | null }

// The case cards with one voice or text choice above them (Matt, 13 Nov): each
// card's single Start case uses it. Voice is the default; the choice isn't
// remembered between visits (that would need storage: awaiting Matt).
export function CaseList({ cases, left }: { cases: CaseCard[]; left: CasesLeft | null }) {
  const [mode, setMode] = useState<CaseMode>('voice');
  const pill = 'flex cursor-pointer items-center rounded-full border border-ink/20 bg-white px-3.5 py-1.5 transition-colors hover:border-ink/40 has-[:checked]:border-cobalt has-[:checked]:bg-sky/50 has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt motion-reduce:transition-none';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <fieldset className="t-small flex flex-wrap items-center gap-2">
          <legend className="sr-only">Take the case by</legend>
          <label className={pill}><input type="radio" name="case-mode" value="voice" checked={mode === 'voice'} onChange={() => setMode('voice')} className="sr-only" />Voice (headphones recommended)</label>
          <label className={pill}><input type="radio" name="case-mode" value="text" checked={mode === 'text'} onChange={() => setMode('text')} className="sr-only" />Text</label>
        </fieldset>
        {left && (
          <p className="t-small text-ink/70">
            {left.block ? limitMessage(left.block)
              : left.scope === 'day' ? `${left.n} ${left.n === 1 ? 'case' : 'cases'} left today (up to ${left.perDay} in any 24 hours)`
              : `${left.n} ${left.n === 1 ? 'case' : 'cases'} left this month`}
          </p>
        )}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {cases.map(c => (
          <li key={c.id} id={`case-${c.id}`} className={`flex scroll-mt-20 flex-col justify-between gap-5 rounded-panel border bg-white p-5 shadow-quiet sm:p-6 ${c.recommended ? 'border-cobalt ring-1 ring-cobalt' : 'border-ink/12'}`}>
            <div className="space-y-1">
              {c.recommended
                ? <p className="t-label inline-flex rounded-full bg-cobalt px-2.5 py-0.5 font-semibold text-white">{RECOMMENDED_LABEL}</p>
                : c.first && <p className="t-label inline-flex rounded-full bg-sky px-2.5 py-0.5 font-semibold text-ink">Good first case</p>}
              <p className="t-heading font-semibold">{c.title}</p>
              <p className="t-small text-ink/70">{[DIFFICULTY[c.difficulty], c.caseType && TYPE_LABEL(c.caseType), `about ${c.minutes} min`].filter(Boolean).join(' · ')}</p>
              {c.done > 0 && c.last && (
                <p className="t-small text-ink/70">Done {c.done}× · <Link href={`/case/${c.last}/report`} className="link">View last report</Link></p>
              )}
            </div>
            <StartCaseButton caseId={c.id} label="Start case" name={`Start case: ${c.title}`} variant="outline" mode={mode} blocked={Boolean(left?.block)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Past sessions: the latest five, then Show all.
export function PastSessionList({ past }: { past: PastSession[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? past : past.slice(0, 5);
  return (
    <div className="space-y-3">
      <ul id="past-list" className="divide-y divide-ink/10 overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet">
        {shown.map(s => (
          <li key={s.id} className="t-small flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{s.caseTitle}</p>
              <p className="text-ink/70">{s.date} · {s.status}</p>
            </div>
            {s.link && (s.link.endFirst
              ? <EndThenReport sessionId={s.id} href={s.link.href} label={s.link.label} />
              : <Link href={s.link.href} className={cn(buttonVariants({ variant: s.link.label === 'Continue' ? 'default' : 'outline', size: 'sm' }))}>{s.link.label}</Link>)}
          </li>
        ))}
      </ul>
      {past.length > 5 && !all && (
        <button type="button" aria-controls="past-list" aria-expanded={false} onClick={() => setAll(true)} className="link t-small cursor-pointer">Show all</button>
      )}
    </div>
  );
}

// "Get my report" on an interview whose time ran out (M3): end it (POST /api/channel/<id>/expire), then open the report
// page, which prepares the report. A second click before the disabled state renders is ignored.
export const EXPIRE_FAILED = 'We couldn’t get this report just now. Please try again in a minute.';
function EndThenReport({ sessionId, href, label }: { sessionId: string; href: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const router = useRouter();
  async function go() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const res = await postJson(`/api/channel/${encodeURIComponent(sessionId)}/expire`, {});
    if (res.ok && res.data?.report) { router.push(href); return; }
    if (res.ok) { router.refresh(); return; }   // nothing to report after all: the list shows it ended
    setError(EXPIRE_FAILED);
    setBusy(false);
    inFlight.current = false;
  }
  return (
    <div className="space-y-1 text-right">
      <button type="button" onClick={go} disabled={busy} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>{busy ? 'Preparing…' : label}</button>
      {error && <p role="alert" className="t-small text-alert">{error}</p>}
    </div>
  );
}
