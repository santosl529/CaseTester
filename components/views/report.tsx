import { ChevronRight, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppPage } from '@/components/brand/page';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ReportCard } from '@/components/report-card';
import { PostCaseSurvey } from '@/components/post-case-survey';
import { PrepareReport } from '@/components/prepare-report';
import { AppNav } from '@/components/app-nav';
import { Breadcrumbs } from '@/components/brand/breadcrumbs';
import type { ReportDimension } from '@/lib/scoring/report-dimensions';
import type { PlainPoint } from '@/lib/scoring/judge';
import { RATING_LABELS, type Rating } from '@/lib/scoring/rubric';

// A rating's pill (Matt, 7 Nov): Strong in Mastery green, Adequate in Sky,
// Needs work in Cobalt.
const RATING_BADGE: Record<string, 'strong' | 'adequate' | 'needsWork'> = {
  needs_work: 'needsWork',
  meets_bar: 'adequate',
  strong: 'strong',
};

// The feedback report; app/case/[sessionId]/report/page.tsx checks access
// and loads the score and the transcript.

// The trail above the title: Cases / <case> report.
const trail = (caseTitle: string) => <Breadcrumbs trail={[{ label: 'Cases', href: '/home' }, { label: `${caseTitle} report` }]} />;

// A completed case not scored yet: the page offers to prepare it.
export function UnscoredReportScreen({ sessionId, caseTitle }: { sessionId: string; caseTitle: string }) {
  return (
      <>
        <AppNav />
        <AppPage className="space-y-8">
          <div className="space-y-3">
            {trail(caseTitle)}
            <h1 className="t-title">Interview feedback</h1>
          </div>
          <PrepareReport sessionId={sessionId} />
        </AppPage>
      </>
  );
}

export interface ReportData {
  sessionId: string;
  caseTitle: string;
  // Rule 18A: the candidate ended the interview early — feedback on what was covered.
  partial: boolean;
  overallRating: string | null;
  hasTopFix: boolean;
  topFix: PlainPoint | null;
  topFixLine: string | null;
  dimensions: ReportDimension[];
  modelAnswer: Record<string, string> | null;
  turns: { id: string; role: string; text: string; clock: string }[];
}

export function ReportScreen({ sessionId, caseTitle, partial, overallRating, hasTopFix, topFix, topFixLine, dimensions, modelAnswer, turns }: ReportData) {
  return (
    <>
    <AppNav />
    <AppPage className="space-y-10">
      <div className="space-y-3">
      {trail(caseTitle)}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="t-title">Interview feedback</h1>
        {partial ? (
          <Badge variant="outline">Partial interview — no overall rating</Badge>
        ) : (
          <Badge variant={RATING_BADGE[overallRating ?? 'meets_bar'] ?? 'adequate'}>
            {overallRating ? RATING_LABELS[overallRating as Rating] : null}
          </Badge>
        )}
        <a
          href={`/api/report/${sessionId}/pdf`}
          download
          className={`${buttonVariants({ variant: 'outline', size: 'sm' })} ml-auto`}
        >
          <Download aria-hidden="true" />Download PDF
        </a>
      </header>
      </div>

      {/* The top improvement in Sky (Matt, 7 Nov), Ink text on it. */}
      {hasTopFix && (
        <section aria-labelledby="top-fix" className="space-y-2 rounded-panel bg-sky/60 p-5 sm:p-6">
          <h2 id="top-fix" className="t-heading font-semibold">Top improvement</h2>
          <div className="t-body">
            {topFix ? (
              <>
                <p className="t-small mb-1 text-ink/75">{topFix.where}</p>
                <p className="mb-2">{topFix.what} {topFix.why}</p>
                <p className="font-semibold">{topFix.next}</p>
              </>
            ) : topFixLine}
          </div>
        </section>
      )}

      <div className="space-y-4">
        {dimensions.map(d => (
          <ReportCard key={d.key} label={d.label} rating={d.rating} feedback={d.feedback} legacyEvidence={d.legacyEvidence} />
        ))}
      </div>

      {modelAnswer != null && (() => {
        const ma = modelAnswer;
        return (
          <Card>
            <CardHeader><CardTitle>Model answer</CardTitle></CardHeader>
            <CardContent className="t-body space-y-4">
              <div>
                <p className="t-small mb-1 font-semibold">Structure</p>
                <p className="text-ink/85">{ma.structure}</p>
              </div>
              <div>
                <p className="t-small mb-1 font-semibold">Recommendation</p>
                <p className="text-ink/85">{ma.recommendation}</p>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <PostCaseSurvey sessionId={sessionId} />

      {turns.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Transcript</CardTitle></CardHeader>
          <CardContent>
            <details className="group">
              <summary className="t-small inline-flex cursor-pointer list-none items-center gap-1 font-semibold select-none hover:text-cobalt [&::-webkit-details-marker]:hidden">
                <ChevronRight aria-hidden="true" className="size-4 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />Show full conversation ({turns.length} turns)
              </summary>
              <div className="mt-4 space-y-3">
                {turns.map(t => (
                  <div key={t.id} className="t-small">
                    <p className={`t-label mb-1 font-semibold ${t.role === 'candidate' ? 'text-cobalt' : 'text-ink/70'}`}>
                      {t.role === 'candidate' ? 'You' : 'Interviewer'} <span className="font-normal text-ink/70">· {t.clock}</span>
                    </p>
                    <p className={`whitespace-pre-wrap rounded-window px-3 py-2 ${
                      t.role === 'candidate'
                        ? 'bg-sky/50'
                        : 'bg-paper'
                    }`}>
                      {t.text}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>
      )}
    </AppPage>
    </>
  );
}
