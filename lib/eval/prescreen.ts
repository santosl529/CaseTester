// Opus pre-screen for interviewer faults (spec 2026-10-09 §2.4): proposals
// only — a human confirms. Every proposal must quote the interviewer's line
// of that turn verbatim (after normalising quotes/whitespace), as the
// scoring evidence audit requires of the judge; unverifiable ones are dropped.
import { z } from 'zod';
import type { RunRecord } from './scorecard';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

export const ProposedFaultSchema = z.object({
  turnIndex: z.number().int(),
  category: z.enum(['requests', 'math', 'grounding', 'acknowledgment', 'conversation', 'administration']),
  severity: z.enum(['serious', 'moderate', 'minor']),
  quote: z.string(),
  expected: z.string(),
  rule: z.string(),
  attribution: z.enum(['model', 'orchestrator', 'simulator', 'ambiguous_policy', 'evaluator_uncertain']),
  recovered: z.boolean(),
});
export const PrescreenOutputSchema = z.object({ faults: z.array(ProposedFaultSchema) });
export type ProposedFault = z.infer<typeof ProposedFaultSchema>;

export type FaultRecord = ProposedFault & {
  id: string; runId: string; candidateText: string; context: string[]; rawOutput: string | null;
  codeChanges: string[]; delivered: string; source: 'prescreen' | 'code' | 'human';
  status: 'proposed' | 'confirmed' | 'rejected'; note: string;
};

export function normaliseForQuote(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}

export const MIN_QUOTE_CHARS = 15;

export function verifyQuote(quote: string, delivered: string): boolean {
  const q = normaliseForQuote(quote);
  return q.length >= MIN_QUOTE_CHARS && normaliseForQuote(delivered).includes(q);
}

export function buildPrescreenPrompt(p: { run: RunRecord; turns: TurnRecord[] | null; interviewerInstructions: string; caseFacts: string; severity: string }): string {
  const byIndex = new Map((p.turns ?? []).map(t => [t.turnIndex + 1, t]));
  const transcript = [...p.run.turns].sort((a, b) => a.turnIndex - b.turnIndex).map(t => {
    const rec = t.role === 'interviewer' ? byIndex.get(t.turnIndex) : undefined;
    const vetoes = rec?.checks.find(c => c.check === 'vetoes' && c.decision === 'act')?.detail as { withheld?: { sentence: string; reason: string }[] } | undefined;
    const decisions = rec?.checks.find(c => c.check === 'data_decisions')?.detail;
    const notes = [
      rec && rec.stateBefore.kind !== 'model' ? `code-written turn: ${rec.stateBefore.kind}` : null,
      vetoes?.withheld?.length ? `withheld by code: ${vetoes.withheld.map(w => `"${w.sentence}" (${w.reason})`).join('; ')}` : null,
      decisions ? `data decided by code: ${JSON.stringify(decisions)}` : null,
      rec?.recorderErrors?.length ? `recorder incomplete for this turn: ${[...new Set(rec.recorderErrors.map(e => e.stage))].join(', ')}` : null,
    ].filter(Boolean);
    return `[t${t.turnIndex} ${t.role}] ${t.text}${notes.length ? `\n    (${notes.join(' | ')})` : ''}`;
  }).join('\n');
  return [
    'You are reviewing a mock case interview conducted by an AI interviewer, to find the interviewer\'s faults. The candidate was simulated. Report only faults of the INTERVIEWER (or of the code around it), not the candidate\'s performance.',
    '## The interviewer\'s instructions (what it was told to do)', p.interviewerInstructions,
    '## Case facts (ground truth — data values, answer key)', p.caseFacts,
    '## Severity definitions', p.severity,
    '## Transcript as delivered (interviewer lines are what the candidate actually received; notes in parentheses are what code did)', transcript,
    '## Output',
    'List every interviewer fault. For each: turnIndex of the INTERVIEWER line; category; severity per the definitions; quote = an exact excerpt (at least 15 characters) of that interviewer line; expected = what it should have done, citing the case fact where relevant; rule = the instruction or rule it breaks; attribution = model / orchestrator (code changed or wrote it) / simulator (the candidate broke character, so the interviewer was put in an impossible position) / ambiguous_policy / evaluator_uncertain; recovered = whether a later turn fixed it. If there are none, return an empty list. Do not report style preferences as faults.',
    'A note "(recorder incomplete for this turn: …)" means the evaluation recorder lost part of that turn\'s record (the request, raw output, …); the interviewer line itself is what was delivered. Do not attribute a fault to missing recorder data: a gap in the record is not an interviewer fault.',
  ].join('\n\n');
}

export function toFaultRecords(runId: string, run: RunRecord, turns: TurnRecord[] | null, proposals: ProposedFault[]): { kept: FaultRecord[]; dropped: ProposedFault[] } {
  const line = (i: number) => run.turns.find(t => t.turnIndex === i);
  const kept: FaultRecord[] = []; const dropped: ProposedFault[] = [];
  proposals.forEach((f, n) => {
    const l = line(f.turnIndex);
    if (!l || l.role !== 'interviewer' || !verifyQuote(f.quote, l.text)) { dropped.push(f); return; }
    const rec = turns?.find(t => t.turnIndex + 1 === f.turnIndex) ?? null;
    const withheld = (rec?.checks.find(c => c.check === 'vetoes' && c.decision === 'act')?.detail as { withheld?: { sentence: string; reason: string }[] } | undefined)?.withheld ?? [];
    kept.push({
      ...f, id: `${runId}-t${f.turnIndex}-${n}`, runId,
      candidateText: line(f.turnIndex - 1)?.text ?? '',
      context: [f.turnIndex - 3, f.turnIndex - 2].map(line).filter(Boolean).map(t => `[${t!.role}] ${t!.text}`),
      rawOutput: rec?.outputs.at(-1)?.text ?? null,
      codeChanges: withheld.map(w => `withheld "${w.sentence}" (${w.reason})`),
      delivered: l.text, source: 'prescreen', status: 'proposed', note: '',
    });
  });
  return { kept, dropped };
}

/** runIds already recorded in prescreened.jsonl (blank/malformed lines ignored). */
export function alreadyScreened(lines: string[]): Set<string> {
  const ids = new Set<string>();
  for (const l of lines) {
    if (!l.trim()) continue;
    try { const r = JSON.parse(l) as { runId?: unknown }; if (typeof r.runId === 'string') ids.add(r.runId); } catch { /* ignore */ }
  }
  return ids;
}

export function screenedLine(runId: string, proposed: number, dropped: number, at: Date = new Date()): string {
  return JSON.stringify({ runId, proposed, dropped, at: at.toISOString() });
}
