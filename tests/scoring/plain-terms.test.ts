// Plain English in every report line the candidate reads (Lorenzo, 6 Nov; session 36e78afc's caveat "The interview
// entered load-shedding during the exhibit stage, so optional follow-up probes were dropped").
import { describe, it, expect } from 'vitest';
import { plainReportLine, plainRubric, internalTerms } from '@/lib/scoring/plain-terms';
import { summarizeCoverage } from '@/lib/scoring/assists';

describe('plainReportLine', () => {
  it('rewrites the 36e78afc caveats', () => {
    expect(plainReportLine('The interview entered load-shedding during the exhibit stage, so optional follow-up probes were dropped; thin depth after the COGS decomposition reflects time pressure, not a candidate failing.'))
      .toBe('The interview ran short of time during the exhibit discussion, so optional follow-up questions were dropped; thin depth after the COGS decomposition reflects time pressure, not a candidate failing.');
    expect(plainReportLine('No brainstorming stage was part of this case, and the only ideas offered were two levers.')).toBe('No brainstorming was part of this case, and the only ideas offered were two levers.');
  });

  it('probes as noun and verb; the pressure test; capitalised stage names; rule numbers; rubric words', () => {
    expect(plainReportLine('especially when the interviewer probes it. A probe like that is a signal')).toBe('especially when the interviewer questions it. A follow-up question like that is a signal');
    expect(plainReportLine('The interviewer never administered the pressure test (Rule 7) during STRUCTURE.')).toBe('The interviewer never asked the follow-up question on your structure during your opening structure.');
    expect(plainReportLine('Load shedding began in EXHIBIT; this rating meets_bar.')).toBe('Time pressure began in EXHIBIT; this rating on track.'.replace('in EXHIBIT', 'in the exhibit discussion'));
    expect(plainReportLine('Attributed to session coverage.')).toBe('Attributed to how the interview ran.');
  });

  it('never touches the candidate’s quoted words', () => {
    expect(plainReportLine('You said "I would probe the EXHIBIT stage" and moved on.')).toBe('You said "I would probe the EXHIBIT stage" and moved on.');
    expect(internalTerms('You said "load shedding probe"')).toEqual([]);
  });

  it('leaves ordinary English alone', () => {
    for (const t of ['Your structure split costs from revenue.', 'The recommendation led with the answer.', 'In the exhibit discussion you read every line.', 'Exhibit 2 shows the cost lines.'])
      expect(plainReportLine(t)).toBe(t);
  });
});

describe('plainRubric', () => {
  it('rewrites caveats, points, plain-words fields and both forms of the top fix; ratings and quotes untouched', () => {
    const rubric = {
      dataExhibit: { rating: 'meets_bar', coverageCaveat: 'The interview entered load-shedding during the exhibit stage.', wentWell: [], needsWork: [{ point: 'Answered the probe late.', quotes: ['I probe it'], plain: { where: 'In the EXHIBIT stage', what: 'a probe', why: 'x', next: 'y' } }], missedOpportunities: [{ moment: 'During the pressure test', betterResponse: 'Say "probe"' }] },
      overallRating: 'meets_bar', topFix: 'Recompute when the interviewer probes a figure.', topFixPlain: { where: 'After the probe', what: 'a', why: 'b', next: 'c' },
    };
    const out = plainRubric(rubric);
    expect(out.dataExhibit.coverageCaveat).toBe('The interview ran short of time during the exhibit discussion.');
    expect(out.dataExhibit.rating).toBe('meets_bar');
    expect(out.dataExhibit.needsWork[0].point).toBe('Answered the follow-up question late.');
    expect(out.dataExhibit.needsWork[0].quotes).toEqual(['I probe it']);
    expect(out.dataExhibit.needsWork[0].plain).toEqual({ where: 'In the exhibit discussion', what: 'a follow-up question', why: 'x', next: 'y' });
    expect(out.dataExhibit.missedOpportunities[0].moment).toBe('During the follow-up question on your structure');
    expect(out.dataExhibit.missedOpportunities[0].betterResponse).toBe('Say "probe"');
    expect(out.topFix).toBe('Recompute when the interviewer questions a figure.');
    expect(out.topFixPlain.where).toBe('After the follow-up question');
    expect(out.overallRating).toBe('meets_bar');
    expect(rubric.dataExhibit.coverageCaveat).toMatch(/load-shedding/);   // a copy, not in place
  });
});

describe('what the judge is fed', () => {
  it('the time-pressure note names no internal term in the line the judge copies', () => {
    const line = summarizeCoverage([{ subtype: 'load_shed', phase: 'EXHIBIT', payloadJsonb: {} }]).split('\n')[0];
    expect(line).toContain('from the exhibit discussion on');
    expect(internalTerms(line)).toEqual([]);
  });
});
