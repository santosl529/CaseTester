// Item-choice experiment, arm B (Lorenzo, 27 Oct; measurement only, `itemJudge`): recorded Sonnet-judge verdicts per
// candidate message, read from ITEM_JUDGE_VERDICTS (a JSON array written by scripts/xp-item-choice/judge.ts). With
// ITEM_JUDGE_INTIME=1 only the verdicts that would have arrived before the data line are used. Replay-only.
import { existsSync, readFileSync } from 'node:fs';
export type JudgeAsk = { ask: string; items: { id: string; answers: 'full' | 'partial' }[]; missing: string };
type Row = { caseId: string; candidateText: string; verdict: { asks?: JudgeAsk[] } | null; inTime?: boolean };
let table: Map<string, Row> | null = null;
export function judgeVerdict(caseId: string, candidateText: string): JudgeAsk[] | null {
  const p = process.env.ITEM_JUDGE_VERDICTS;
  if (!p || !existsSync(p)) return null;
  table ??= new Map((JSON.parse(readFileSync(p, 'utf8')) as Row[]).map(r => [`${r.caseId}\u0000${r.candidateText.trim()}`, r]));
  const r = table.get(`${caseId}\u0000${candidateText.trim()}`);
  if (!r || !r.verdict?.asks) return null;
  if (process.env.ITEM_JUDGE_INTIME === '1' && r.inTime !== true) return null;
  return r.verdict.asks;
}
