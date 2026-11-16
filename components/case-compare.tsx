import { Badge } from '@/components/ui/badge';
import { RATING_LABELS, RUBRIC_DIMENSION_LABELS, type Rating } from '@/lib/scoring/rubric';
import type { ReportDrillsView } from '@/lib/drills/progress/report-view';

// Case to case on the report (Matt, 15 Nov; proposal §2.9): each dimension
// against the last case at the same level, after Top improvement. Shown only
// when CASE_TO_DRILLS is on. Colour is never the only signal: every rating is
// a word, and each arrow has a text alternative.
const PILL: Record<string, 'strong' | 'adequate' | 'needsWork'> = { strong: 'strong', meets_bar: 'adequate', needs_work: 'needsWork' };
const DIFFICULTY = ['', 'Easy', 'Medium', 'Hard'];
const label = (r: string) => { const l = RATING_LABELS[r as Rating] ?? r; return l.charAt(0).toUpperCase() + l.slice(1); };
const date = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function CaseCompare({ comparison: c }: { comparison: NonNullable<ReportDrillsView['comparison']> }) {
  const title = c.kind === 'same_case' ? 'Last time on this case' : `Since your last ${DIFFICULTY[c.previous.tier]} case`;
  return (
    <section aria-labelledby="case-compare" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 sm:p-6">
      <div className="space-y-0.5">
        <h2 id="case-compare" className="t-heading font-semibold">{title}</h2>
        <p className="t-small text-ink/70">{c.previousTitle}, {date(c.previous.completedAt)}</p>
      </div>
      <table className="w-full t-small">
        <caption className="sr-only">Your ratings compared with {c.previousTitle}</caption>
        <thead><tr className="text-left t-label text-ink/70"><th scope="col" className="pb-2 pr-3 font-medium">Area</th><th scope="col" className="pb-2 font-medium">Last case, then this case</th></tr></thead>
        <tbody>
          {c.rows.map(r => (
            <tr key={r.dimension} className="border-t border-ink/10 align-top">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {RUBRIC_DIMENSION_LABELS[r.dimension]}
                {r.sets > 0 && <span className="block text-ink/70">You practiced this in {r.sets} drill {r.sets === 1 ? 'set' : 'sets'} since your last case.</span>}
              </th>
              <td className="py-2">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={PILL[r.before]}>{label(r.before)}</Badge>
                  <span aria-hidden="true" className={`font-semibold ${r.move > 0 ? 'text-mastery' : r.move < 0 ? 'text-cobalt' : 'text-ink/50'}`}>{r.move > 0 ? '↑' : r.move < 0 ? '↓' : '→'}</span>
                  <span className="sr-only">{r.move > 0 ? ', up to ' : r.move < 0 ? ', down to ' : ', the same: '}</span>
                  <Badge variant={PILL[r.after]}>{label(r.after)}</Badge>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
