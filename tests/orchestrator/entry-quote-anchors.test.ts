// Aldermoor's quote anchors (Lorenzo, 19 Oct; batch-32-aldermoor Tyler): his
// misquotes of the funnel and the survey ("Prevalence … is 1.5%", "insurance and
// prior approval at 56%") were never corrected — entry-001 anchored only the
// list price, the selling costs, Nimbrel and US adults, and the exact cell
// lookup can't read Exhibit 1's prose cells or match a paraphrased survey row.
// Anchors for the funnel rates, the barriers and the reasons; a figure the
// item states (any of its rates) is no misquote.
import { describe, it, expect } from 'vitest';
import { getCaseById } from '@/lib/cases/loader';
import { factBaseFor, findCandidateMisquotes } from '@/lib/orchestrator/fact-check';

const c = getCaseById('entry-001');
const fb = factBaseFor(c as never);
const OUT = new Set(['us_adults', 'funnel_rates', 'peak_share_forecast', 'kelvexa_pricing', 'survey_design', 'reasons_to_prescribe', 'barriers_to_prescribing', 'option_a', 'option_b', 'option_shared']);
const flags = (s: string) => findCandidateMisquotes(s, fb, OUT, ['exhibit-1', 'exhibit-2', 'exhibit-3']).map(m => `${m.items[0]}:${m.cited}`);

describe('entry-001 quote anchors', () => {
  it.each([
    ['On barriers: insurance and prior approval at 56% is the top concern, and no local support at 41%.', 'barriers_to_prescribing:at 56%'], // Tyler t13
    ['Insurance coverage is at 56%.', 'barriers_to_prescribing:is at 56%'],
    ['Prevalence is 1.5%.', 'funnel_rates:is 1.5%'],
  ])('a misquote is flagged: "%s"', (s, f) => {
    expect(flags(s)).toEqual([f]);
  });
  it.each([
    'Insurance coverage and prior approval is the top barrier at 58%.',
    'Prior approval at 58% and no local support at 41% are the two biggest barriers.',
    'New drugs take 12–18 months to win coverage, and prior approval is usually required.',
    'Prevalence is 1.6%, and half of those are diagnosed.',
    'The once-daily pill at 64% is the top reason, with fewer side effects at 38%.',
    'Side-effect concerns are only 9%, and out-of-pocket cost is 15%.',
    'The diagnosis rate is 50% and the treatment rate is 50%.',
  ])('a right quote is not: "%s"', s => {
    expect(flags(s)).toEqual([]);
  });
});
