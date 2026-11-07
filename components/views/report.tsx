import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ReportCard } from '@/components/report-card';
import { PostCaseSurvey } from '@/components/post-case-survey';
import { PrepareReport } from '@/components/prepare-report';
import { SiteHeader } from '@/components/site-header';
import type { ReportDimension } from '@/lib/scoring/report-dimensions';
import type { PlainPoint } from '@/lib/scoring/judge';
import { RATING_LABELS, type Rating } from '@/lib/scoring/rubric';

const RATING_COLOR: Record<string, string> = {
  needs_work: 'destructive',
  meets_bar: 'secondary',
  strong: 'default',
};

// The feedback report; app/case/[sessionId]/report/page.tsx checks access
// and loads the score and the transcript.

// A completed case not scored yet: the page offers to prepare it.
export function UnscoredReportScreen({ sessionId }: { sessionId: string }) {
  return (
      <>
        <SiteHeader />
        <main className="w-full max-w-2xl mx-auto py-8 px-4 space-y-6">
          <h1 className="text-2xl font-bold">Interview Feedback</h1>
          <PrepareReport sessionId={sessionId} />
        </main>
      </>
  );
}

export interface ReportData {
  sessionId: string;
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

export function ReportScreen({ sessionId, partial, overallRating, hasTopFix, topFix, topFixLine, dimensions, modelAnswer, turns }: ReportData) {
  return (
    <>
    <SiteHeader />
    <main className="w-full max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Interview Feedback</h1>
        {partial ? (
          <Badge variant="outline">Partial interview — no overall rating</Badge>
        ) : (
          <Badge variant={RATING_COLOR[overallRating ?? 'meets_bar'] as 'destructive' | 'secondary' | 'default'}>
            {overallRating ? RATING_LABELS[overallRating as Rating] : null}
          </Badge>
        )}
        <a
          href={`/api/report/${sessionId}/pdf`}
          download
          className={`${buttonVariants({ variant: 'outline', size: 'sm' })} ml-auto`}
        >
          Download PDF
        </a>
      </div>

      {hasTopFix && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader><CardTitle className="text-base">Top improvement</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {topFix ? (
              <>
                <p className="text-neutral-500 mb-1">{topFix.where}</p>
                <p className="text-neutral-800 mb-1">{topFix.what} {topFix.why}</p>
                <p className="text-neutral-900 font-medium">{topFix.next}</p>
              </>
            ) : topFixLine}
          </CardContent>
        </Card>
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
            <CardHeader><CardTitle className="text-base">Model Answer</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-3">
              <div>
                <p className="font-medium mb-1">Structure</p>
                <p className="text-neutral-700">{ma.structure}</p>
              </div>
              <div>
                <p className="font-medium mb-1">Recommendation</p>
                <p className="text-neutral-700">{ma.recommendation}</p>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <PostCaseSurvey sessionId={sessionId} />

      {turns.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Transcript</CardTitle></CardHeader>
          <CardContent>
            <details>
              <summary className="text-sm text-neutral-600 cursor-pointer select-none">
                Show full conversation ({turns.length} turns)
              </summary>
              <div className="mt-4 space-y-3">
                {turns.map(t => (
                  <div key={t.id} className="text-sm">
                    <p className="font-medium text-neutral-500 text-xs mb-0.5">
                      {t.role === 'candidate' ? 'You' : 'Interviewer'} · {t.clock}
                    </p>
                    <p className={`whitespace-pre-wrap rounded-md px-3 py-2 ${
                      t.role === 'candidate'
                        ? 'bg-blue-50 text-neutral-900'
                        : 'bg-neutral-100 text-neutral-900'
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
    </main>
    </>
  );
}
