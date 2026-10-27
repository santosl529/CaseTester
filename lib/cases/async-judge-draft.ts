// Step 3 (`asyncAskJudge`; Lorenzo, 27 Oct; measurement only): the background judge's verdict on the candidate's
// previous message, recorded by scripts/xp-item-choice/async-judge.ts (ASYNC_JUDGE_VERDICTS). A verdict that would
// not have landed before the next message (`inTime` false) is never served: the turn never waits. Replay-only.
import { existsSync, readFileSync } from 'node:fs';
import type { JudgeAsk } from './item-judge-draft';
type Row = { caseId: string; candidateText: string; verdict: { asks?: JudgeAsk[] } | null; inTime: boolean };
let table: Map<string, Row> | null = null;
export function asyncJudgeVerdict(caseId: string, previousCandidateText: string): JudgeAsk[] | null {
  const p = process.env.ASYNC_JUDGE_VERDICTS;
  if (!p || !existsSync(p)) return null;
  table ??= new Map((JSON.parse(readFileSync(p, 'utf8')) as Row[]).map(r => [`${r.caseId}\u0000${r.candidateText.trim()}`, r]));
  const r = table.get(`${caseId}\u0000${previousCandidateText.trim()}`);
  return r && r.inTime && r.verdict?.asks ? r.verdict.asks : null;
}
