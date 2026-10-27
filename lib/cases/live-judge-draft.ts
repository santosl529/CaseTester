// `liveAskJudge` (Lorenzo, 27 Oct; measurement only): the Sonnet judge started at message arrival, used on this very
// turn when its verdict is in before code decides the data line (LIVE_JUDGE_VARIANT=decide) or before the line is
// spoken (=spoken); `all` serves every verdict (the ceiling). Recorded verdicts and timings: LIVE_JUDGE_VERDICTS.
import { existsSync, readFileSync } from 'node:fs';
import type { JudgeAsk } from './item-judge-draft';
type Row = { caseId: string; candidateText: string; verdict: { asks?: JudgeAsk[] } | null; liveDecide: boolean; liveSpoken: boolean };
let table: Map<string, Row> | null = null;
export function liveJudgeVerdict(caseId: string, candidateText: string): JudgeAsk[] | null {
  const p = process.env.LIVE_JUDGE_VERDICTS;
  if (!p || !existsSync(p)) return null;
  table ??= new Map((JSON.parse(readFileSync(p, 'utf8')) as Row[]).map(r => [`${r.caseId}\u0000${r.candidateText.trim()}`, r]));
  const r = table.get(`${caseId}\u0000${candidateText.trim()}`);
  if (!r || !r.verdict?.asks) return null;
  const v = process.env.LIVE_JUDGE_VARIANT ?? 'decide';
  return v === 'all' || (v === 'spoken' ? r.liveSpoken : r.liveDecide) ? r.verdict.asks : null;
}
