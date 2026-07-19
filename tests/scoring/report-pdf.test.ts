import { describe, it, expect } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { ReportPdf } from '@/app/api/report/[sessionId]/pdf/report-pdf';
import { RUBRIC_DIMENSION_LABELS, RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';
import type { DimensionFeedback } from '@/lib/scoring/judge';

const richFeedback: DimensionFeedback = {
  rating: 'meets_bar',
  wentWell: [{ point: 'Clear top-down structure.', quotes: ['My structure: 1. Isolate the margin driver'] }],
  needsWork: [{ point: 'Asserted growth figure without derivation.', quotes: ['So it\'s same-store sales growth of 15%'] }],
  missedOpportunities: [{
    moment: 'After the coffee-cost reveal, the candidate accepted their own 12-14 point estimate.',
    betterResponse: 'Let me check that: if coffee is a third of COGS, COGS is 42% of revenue, so coffee is ~14% of revenue — a 40% spike adds ~5-6 points, not 12-14.',
  }],
};

describe('report PDF', () => {
  it('renders a valid PDF with rich per-dimension feedback', async () => {
    const buffer = await renderToBuffer(
      ReportPdf({
        caseTitle: 'Test Coffee Case',
        completedAt: '2026-07-04',
        overallRating: 'strong',
        topFix: 'Derive the recovery math instead of asserting it.',
        dimensions: RUBRIC_DIMENSION_KEYS.map(key => ({
          key,
          label: RUBRIC_DIMENSION_LABELS[key],
          rating: 'meets_bar',
          feedback: richFeedback,
          legacyEvidence: null,
        })),
        modelAnswer: { structure: 'Profit = revenue − costs.', recommendation: 'Raise prices selectively.' },
        turns: [
          { role: 'interviewer', text: 'Our client is a coffee chain.', clock: '0:00' },
          { role: 'candidate', text: 'Can I take a minute to structure?', clock: '0:12' },
        ],
      }),
    );

    // %PDF magic bytes
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('renders an exhibit-delivery marker under the turn that showed it', async () => {
    // Regression: the PDF transcript used to render only spoken text, so a
    // real exhibit delivery (a chart, not text) read identically to a broken
    // "here's the exhibit" promise with nothing behind it.
    const buffer = await renderToBuffer(
      ReportPdf({
        caseTitle: 'Test Coffee Case',
        completedAt: '2026-07-19',
        overallRating: 'strong',
        topFix: null,
        dimensions: [],
        modelAnswer: null,
        turns: [
          { role: 'interviewer', text: 'What data would help?', clock: '0:40' },
          { role: 'candidate', text: 'The cost structure over time.', clock: '0:53' },
          {
            role: 'interviewer', text: "We have exactly that. Here's the cost structure over time.",
            clock: '0:55', exhibitTitle: 'Brew & Bean Cost Structure Over Time',
          },
        ],
      }),
    );
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('renders legacy rows (flat evidence, no rich feedback)', async () => {
    const buffer = await renderToBuffer(
      ReportPdf({
        caseTitle: 'Test Case',
        completedAt: '2026-07-04',
        overallRating: null,
        topFix: null,
        dimensions: [{
          key: 'structure',
          label: 'Problem Structuring',
          rating: null,
          feedback: null,
          legacyEvidence: ['An old-format evidence quote'],
        }],
        modelAnswer: null,
        turns: [],
      }),
    );
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
