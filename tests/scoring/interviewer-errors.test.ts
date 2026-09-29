import { describe, it, expect } from 'vitest';
import { buildInterviewerMarks, dropClaimsOnMarkedTurns, formatInterviewerMarksSection } from '@/lib/scoring/interviewer-errors';

// Turn texts from the 27–28 Sep persona runs (docs/interviewer-behavior.md v4.3).
const turns = (...t: [string, string][]) => t.map(([role, text], turnIndex) => ({ role, text, turnIndex }));

describe('buildInterviewerMarks', () => {
  it('marks a correction with no recompute flag behind it (Carmen ec32a47f, Priya 6caca9a1)', () => {
    const t = turns(
      ['candidate', 'Prices flat for two years while every input line rose.'],
      ['interviewer', 'One correction on your framing — revenue per store is around 2.4 million, not the figure your latte example implied.'],
      ['candidate', 'Okay, sorry.'],
    );
    const marks = buildInterviewerMarks(t, []);
    expect(marks).toEqual([expect.objectContaining({ kind: 'unbacked_correction', interviewerTurn: 1, candidateTurns: [2] })]);
  });

  it('does not mark a correction backed by a recompute flag on the preceding candidate turn', () => {
    const t = turns(['candidate', 'Revenue per store is $0.5 million.'], ['interviewer', "It's closer to 2.4, not 0.5."]);
    expect(buildInterviewerMarks(t, [{ category: 'intervention', subtype: 'recompute_flag', turnIndex: 0 }])).toEqual([]);
  });

  it('does not treat the interviewer correcting itself as a correction (Yuki 9a873577)', () => {
    const t = turns(['candidate', 'ok'], ['interviewer', 'Let me correct one thing — I have the menu price data.']);
    expect(buildInterviewerMarks(t, [])).toEqual([]);
  });

  it("marks an empty release from the candidate's complaint (Maya c230fe12, Omar faa999fd)", () => {
    for (const complaint of [
      "I don't think I actually see a number there — did it come through?",
      "I don't see the number come through on my end — could you repeat the menu price change?",
    ]) {
      const t = turns(['interviewer', "Here's the menu price change."], ['candidate', complaint]);
      expect(buildInterviewerMarks(t, []).map(m => m.kind), complaint).toEqual(['empty_release']);
    }
  });

  it('marks C2 warnings and C5 exchanges from conduct events', () => {
    const t = turns(['candidate', 'quote'], ['interviewer', 'warning'], ['candidate', 'sorry']);
    const kinds = buildInterviewerMarks(t, [
      { category: 'conduct', subtype: 'C2', turnIndex: 0 },
      { category: 'conduct', subtype: 'C5', turnIndex: 0 },
    ]).map(m => [m.kind, m.candidateTurns]);
    expect(kinds).toEqual([['conduct_warning', [0, 2]], ['wellbeing', [0, 2]]]);
  });

  it('marks unanswered requests from the data-coverage summary', () => {
    const t = turns(['candidate', 'Did menu prices change?'], ['interviewer', 'Walk me through costs.'], ['candidate', 'You never answered my price question.']);
    const marks = buildInterviewerMarks(t, [], [{ label: 'Menu price changes over 2 years', turnIndex: 0 }]);
    expect(marks).toEqual([expect.objectContaining({ kind: 'unanswered_request', candidateTurns: [2] })]);
    expect(formatInterviewerMarksSection(marks)).toContain('Menu price changes over 2 years');
  });
});

describe('dropClaimsOnMarkedTurns', () => {
  const t = turns(
    ['candidate', 'I gather the CEO basically said you are an idiot if you think it is labor.'],
    ['interviewer', "Let's keep this professional."],
    ['candidate', 'Sorry, I was quoting the CEO. Margin is down 18 points.'],
  );
  const marks = buildInterviewerMarks(t, [{ category: 'conduct', subtype: 'C2', turnIndex: 0 }]);
  const rubric = {
    communication: { needsWork: [
      { point: 'Professionalism lapse (Omar faa999fd)', quotes: ['the CEO basically said you are an idiot'] },
      { point: 'Mixed evidence', quotes: ['Sorry, I was quoting the CEO.', 'not in transcript'] },
    ] },
  };

  it('drops an item whose only evidence is a marked turn, keeps one with unmarked evidence', () => {
    const { rubric: out, dropped } = dropClaimsOnMarkedTurns(rubric, ['communication'], t, marks);
    expect(dropped.map(d => d.point)).toEqual(['Professionalism lapse (Omar faa999fd)']);
    expect(out.communication.needsWork.map(i => i.point)).toEqual(['Mixed evidence']);
  });
});
