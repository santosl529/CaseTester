import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DimensionFeedback, FeedbackItem } from '@/lib/scoring/judge';
import { ratingLabel } from '@/lib/scoring/rubric';
import { evidenceQuotes } from '@/lib/scoring/report-dimensions';

// A rating's pill (Matt, 7 Nov): Strong in Mastery green, Adequate in Sky,
// Needs work in Cobalt; unrated or not assessed, an outline.
const RATING_BADGE: Record<string, 'strong' | 'adequate' | 'needsWork'> = {
  needs_work: 'needsWork',
  meets_bar: 'adequate',
  strong: 'strong',
};

// Each kind of point gets a small marker in its rating's colour beside an Ink heading.
function Kind({ tone, children }: { tone: 'well' | 'work' | 'missed'; children: React.ReactNode }) {
  return (
    <p className="t-small mb-2 flex items-center gap-2 font-semibold">
      <span aria-hidden="true" className={`size-2 rounded-full ${tone === 'well' ? 'bg-mastery' : tone === 'work' ? 'bg-cobalt' : 'border border-ink/25 bg-sky'}`} />
      {children}
    </p>
  );
}

type Props = {
  label: string;
  rating: string | null;
  feedback: DimensionFeedback | null;
  legacyEvidence: unknown;
};

function Quote({ children }: { children: string }) {
  return (
    <blockquote className="t-small mb-1.5 border-l border-ink/25 pl-3 text-ink/70 italic">
      &ldquo;{children}&rdquo;
    </blockquote>
  );
}

// A point in plain words (report tone, 31 Oct): where, what and why, then what to try; else the judge's point.
function Point({ item }: { item: FeedbackItem }) {
  return (
    <div className="t-small mb-4 last:mb-0">
      {item.plain ? (
        <>
          <p className="mb-1 text-ink/70">{item.plain.where}</p>
          <p className="mb-1">{item.plain.what} {item.plain.why}</p>
          <p className="mb-1.5 font-semibold">{item.plain.next}</p>
        </>
      ) : (
        <p className="mb-1.5">{item.point}</p>
      )}
      {evidenceQuotes(item).map((q, j) => <Quote key={j}>{q}</Quote>)}
    </div>
  );
}

// Collapsed at first (Matt, 22 Nov): the skill area and its grade, with "Show feedback" to open the same content as
// before. A native <details>: keyboard and screen readers get a disclosure that says whether it's open.
export function ReportCard({ label, rating, feedback, legacyEvidence }: Props) {
  return (
    <Card className="py-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 rounded-panel px-5 py-4 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
          <CardTitle className="min-w-0 basis-full sm:basis-auto sm:flex-1">{label}</CardTitle>
          <Badge variant={(rating && RATING_BADGE[rating]) || 'outline'}>
            {ratingLabel(rating)}
          </Badge>
          <span className="t-small ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-cobalt">
            <span className="group-open:hidden">Show feedback</span>
            <span className="hidden group-open:inline">Hide feedback</span>
            <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
      <CardContent className="space-y-5 pb-6">
        {feedback ? (
          <>
            {feedback.coverageCaveat && (
              <p className="t-small text-ink/70 italic">{feedback.coverageCaveat}</p>
            )}
            {feedback.wentWell.length > 0 && (
              <div>
                <Kind tone="well">What went well</Kind>
                {feedback.wentWell.map((item, i) => <Point key={i} item={item} />)}
              </div>
            )}
            {feedback.needsWork.length > 0 && (
              <div>
                <Kind tone="work">What needs work</Kind>
                {feedback.needsWork.map((item, i) => <Point key={i} item={item} />)}
              </div>
            )}
            {feedback.missedOpportunities.length > 0 && (
              <div>
                <Kind tone="missed">Missed opportunities</Kind>
                {feedback.missedOpportunities.map((item, i) => (
                  <div key={i} className="t-small mb-4 last:mb-0">
                    {item.plain ? (
                      <>
                        <p className="mb-1 text-ink/70">{item.plain.where}</p>
                        <p className="mb-1.5">{item.plain.what} {item.plain.why}</p>
                      </>
                    ) : (
                      <p className="mb-1.5 text-ink/80">{item.moment}</p>
                    )}
                    {item.betterResponse && (
                      <p className="rounded-field bg-paper px-3 py-2">
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
      </details>
    </Card>
  );
}
