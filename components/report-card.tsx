import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DimensionFeedback } from '@/lib/scoring/judge';
import { RATING_LABELS, type Rating } from '@/lib/scoring/rubric';

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

export function ReportCard({ label, rating, feedback, legacyEvidence }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label}</CardTitle>
          <Badge variant={RATING_COLOR[rating ?? 'meets_bar'] as 'destructive' | 'secondary' | 'default'}>
            {rating ? RATING_LABELS[rating as Rating] ?? rating : 'unrated'}
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
                {feedback.wentWell.map((item, i) => (
                  <div key={i} className="mb-2">
                    <p className="text-sm text-neutral-800 mb-1">{item.point}</p>
                    {item.quotes.map((q, j) => <Quote key={j}>{q}</Quote>)}
                  </div>
                ))}
              </div>
            )}
            {feedback.needsWork.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-1.5">What needs work</p>
                {feedback.needsWork.map((item, i) => (
                  <div key={i} className="mb-2">
                    <p className="text-sm text-neutral-800 mb-1">{item.point}</p>
                    {item.quotes.map((q, j) => <Quote key={j}>{q}</Quote>)}
                  </div>
                ))}
              </div>
            )}
            {feedback.missedOpportunities.length > 0 && (
              <div>
                <p className="text-sm font-medium text-blue-700 mb-1.5">Missed opportunities</p>
                {feedback.missedOpportunities.map((item, i) => (
                  <div key={i} className="mb-2">
                    <p className="text-sm text-neutral-600 mb-1">{item.moment}</p>
                    <p className="text-sm text-neutral-900 border-l-2 border-blue-200 pl-3">
                      A great answer: &ldquo;{item.betterResponse}&rdquo;
                    </p>
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
