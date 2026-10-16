// Lorenzo, 14 Oct (batch-24 ruling 4): risk questions without "biggest risk",
// and with "risks", count. Fiona a4485b6d t14 was asked the risk question, but
// the case ran on to time-up and the stage minutes said "owed risk".
import { describe, it, expect } from 'vitest';
import { asksRiskQuestion } from '@/lib/orchestrator/spoken-close';
import { updateStages, type StageTurn } from '@/lib/orchestrator/stage-evidence';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';

describe('a risk question once a recommendation is on the table', () => {
  it.each([
    'Understood. You named lock-in and customer reaction as risks. Of everything that could stop this plan from restoring margin, which is the single biggest, and how would you mitigate it?',   // Fiona t14
    "Understood. You named competitive reaction and price sensitivity as risks. Which single risk could most undermine this recommendation, and how would you know early that it's happening?",   // Ines 62d06bd6 t20
    'If you raise prices and customers do respond by buying less, what is the biggest threat to your recommendation, and how would you structure the increase to protect against it?',              // Daniel 903bd42f t20
    'What could sink this plan in the first six months?',
    // Lorenzo, 16 Oct: the risk question in any risk wording — the end gate stayed shut ten minutes on Raj's.
    "Understood. You named traffic loss as a risk and inflation continuing as another. Suppose the pilot comes back and traffic falls more than you expected. Walk me through what you'd do, and which of those two risks worries you more for the CEO.",   // Raj 2eb0fdd3 t18 (batch 28)
    'Right. You said an 8 to 10% price increase recovers most of the gap. Walk me through that. And of the risks you named, which one would most undermine the recommendation, and why?',   // Blake 57406d0f (batch 27)
    'Understood. You named volume loss as a risk. Suppose the price increase causes volume to fall more than you expected. What would you watch for, and how would that change your plan?',   // Marcus 9cb2554f (batch 27)
  ])('%s', q => expect(asksRiskQuestion(q, true)).toBe(true));
  it.each([
    'How would you mitigate the waste problem in the stores?',
    'Which single input could most undermine the bean story?',
    'Which of those two inputs worries you more?',
    'Suppose bean prices fall next year. How would that change your plan for the analysis?',
  ])('before a recommendation, an analysis question is not: %s', q => expect(asksRiskQuestion(q, false)).toBe(false));
});

describe('the stage record counts it', () => {
  const turn = (over: Partial<StageTurn>): StageTurn => ({ turnIndex: 4, candidateText: 'ok', question: '', exhibitShown: false, released: false, recAsked: false,
    recommendationDelivered: false, pressureTest: INITIAL_PRESSURE_TEST, candidateFigures: 0, ...over });
  it("Fiona t14, after her recommendation: the risk stage is delivered", () => {
    const rec = updateStages(undefined, turn({ question: 'Pulling it together: what is your recommendation to the CEO?', recAsked: true }));
    const r = updateStages(rec, turn({ turnIndex: 14, candidateText: 'Attack the input cost base through procurement.', recommendationDelivered: true,
      question: 'Understood. You named lock-in and customer reaction as risks. Of everything that could stop this plan from restoring margin, which is the single biggest, and how would you mitigate it?' }));
    expect(r.risk.delivered).toBe(true);
  });
  it('a risk move whose words say "risks" counts', () => {
    const rec = updateStages(undefined, turn({ question: 'What do you recommend?', move: 'recommendation' }));
    expect(updateStages(rec, turn({ turnIndex: 6, question: 'Of the risks you see, which matters most to the CEO?', move: 'risk' })).risk.delivered).toBe(true);
  });
});
