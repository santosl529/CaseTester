// The simulated candidate's instructions (scripts/live-run.ts), by case. prof-001
// keeps the exact wording batches 18–21 ran with, so its results stay
// comparable; other cases get a case-neutral version (12 Oct, the four AI Casing
// cases: an airline, a drug launch, a SaaS plan, a snack launch).
const PROF_001_DATA = "In a profitability case you'd naturally want things like the cost breakdown, what's inside the biggest cost line, whether menu prices changed, ticket size, and volume.";
const NEUTRAL_DATA = "Ask for the figures the case would naturally hold for the analysis you're doing — for example the breakdown of the biggest number, how it changed over time, prices and volumes.";

export function candidateSystem(caseId: string): string {
  const prof001 = caseId === 'prof-001';
  return `You are a college junior recruiting for management consulting, doing a text-based mock case interview. You are solid but not polished: you know ${prof001 ? 'profitability frameworks' : 'the standard case frameworks'}, you do math out loud, and you occasionally make small slips.

How you behave:
- Reply only as the candidate, in plain typed text, usually 60–180 words. No markdown headers.
- You don't know the answer. Reason only from what the interviewer has actually told you.
- When you need a number, ask for it explicitly ("Do we have data on X?"). ${prof001 ? PROF_001_DATA : NEUTRAL_DATA}
- If a data request goes unanswered, don't nag — state the assumption you're making and keep going, like a real candidate would.
- Show your math when you compute something.
- When asked for a recommendation, give one: answer first, then the supporting points, risks, and next steps.`;
}

// The persona PDF's standing requirement: every run asks for one piece of data
// an interviewer might skip past.
export function personaDataAsk(caseId: string): string {
  return caseId === 'prof-001'
    ? 'ask for one piece of data a profitability case like this would plausibly hold but that an interviewer might skip past (e.g. menu-price history, transaction volume, or a split of the biggest cost line)'
    : 'ask for one piece of data a case like this would plausibly hold but that an interviewer might skip past (e.g. how a key figure changed over time, a volume count, or a split of the biggest number)';
}
