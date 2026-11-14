import type { PastSession } from '@/lib/site/past-sessions';
import { AppNav } from '@/components/app-nav';
import { AppPage } from '@/components/brand/page';
import { CaseList, PastSessionList, type CaseCard, type CasesLeft } from '@/components/case-list';

// /home's page (site flow, 19 Oct), Cases in the app's bar: one job, doing a
// full case (Matt, 13 Nov): voice or text once, the cases, past sessions.
export function HomeView({ cases, past, left }: { cases: CaseCard[]; past: PastSession[]; left: CasesLeft | null }) {
  return (
    <>
      <AppNav />
      <AppPage width="reading" className="space-y-10">
        <section id="cases" aria-labelledby="cases-h" className="scroll-mt-20 space-y-4">
          <div className="space-y-2">
            <h1 id="cases-h" className="t-title">Start a case</h1>
            <p className="t-body text-ink/70">A full interviewer-led case, about 20 minutes. You get a scored feedback report at the end.</p>
          </div>
          <CaseList cases={cases} left={left} />
        </section>

        <section aria-labelledby="past-h" className="space-y-3">
          <h2 id="past-h" className="t-heading font-semibold">Past sessions</h2>
          {past.length === 0
            ? <p className="t-small text-ink/70">No cases yet. Your reports will appear here.</p>
            : <PastSessionList past={past} />}
        </section>
      </AppPage>
    </>
  );
}
