import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DimensionFeedback, FeedbackItem } from '@/lib/scoring/judge';
import { ratingLabel } from '@/lib/scoring/rubric';
import { evidenceQuotes } from '@/lib/scoring/report-dimensions';

const RATING_COLOR: Record<string, string> = {
  needs_work: 'destructive',
  meets_bar: 'secondary',
  strong: 'default',
};

type Props = {
  label: string;
  rating: string | null;
  feedback: DimensionFeedback | null;
  legacyEvidence: unknown;
};

function Quote({ children }: { children: string }) {
  return (
    <blockquote className="border-l-2 border-neutral-300 pl-3 text-sm text-neutral-600 italic mb-1.5">
      &ldquo;{children}&rdquo;
    </blockquote>
  );
}

// A point in plain words (report tone, 31 Oct): where, what and why, then what to try; else the judge's point.
function Point({ item }: { item: FeedbackItem }) {
  return (
    <div className="mb-3">
      {item.plain ? (
        <>
          <p className="text-sm text-neutral-500 mb-1">{item.plain.where}</p>
          <p className="text-sm text-neutral-800 mb-1">{item.plain.what} {item.plain.why}</p>
          <p className="text-sm text-neutral-900 font-medium mb-1">{item.plain.next}</p>
        </>
      ) : (
        <p className="text-sm text-neutral-800 mb-1">{item.point}</p>
      )}
      {evidenceQuotes(item).map((q, j) => <Quote key={j}>{q}</Quote>)}
    </div>
  );
}

export function ReportCard({ label, rating, feedback, legacyEvidence }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label}</CardTitle>
          <Badge variant={RATING_COLOR[rating ?? 'meets_bar'] as 'destructive' | 'secondary' | 'default'}>
            {ratingLabel(rating)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback ? (
          <>
            {feedback.coverageCaveat && (
              <p className="text-sm text-neutral-500 italic">{feedback.coverageCaveat}</p>
            )}
            {feedback.wentWell.length > 0 && (
              <div>
                <p className="text-sm font-medium text-green-700 mb-1.5">What went well</p>
                {feedback.wentWell.map((item, i) => <Point key={i} item={item} />)}
              </div>
            )}
            {feedback.needsWork.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-1.5">What needs work</p>
                {feedback.needsWork.map((item, i) => <Point key={i} item={item} />)}
              </div>
            )}
            {feedback.missedOpportunities.length > 0 && (
              <div>
                <p className="text-sm font-medium text-blue-700 mb-1.5">Missed opportunities</p>
                {feedback.missedOpportunities.map((item, i) => (
                  <div key={i} className="mb-3">
                    {item.plain ? (
                      <>
                        <p className="text-sm text-neutral-500 mb-1">{item.plain.where}</p>
                        <p className="text-sm text-neutral-800 mb-1">{item.plain.what} {item.plain.why}</p>
                      </>
                    ) : (
                      <p className="text-sm text-neutral-600 mb-1">{item.moment}</p>
                    )}
                    {item.betterResponse && (
                      <p className="text-sm text-neutral-900 border-l-2 border-blue-200 pl-3">
                        {item.plain ? 'Next time, try something like' : 'A great answer'}: &ldquo;{item.betterResponse}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          Array.isArray(legacyEvidence) &&
          legacyEvidence.map((q: string, i: number) => <Quote key={i}>{q}</Quote>)
        )}
      </CardContent>
    </Card>
  );
}
