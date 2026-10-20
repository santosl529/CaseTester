// The item-less ask check (turn-data.ts checkAsk → classifyAsk, round 5b Task 56)
// served by a test's mock of the detection classifier, as it was called before
// the check had its own prompt: "Could I get <ask>?". Detections (the old shape)
// read as all full; a mock may also return the check's own shape ({ items }).
import { askResultOf } from '@/lib/eval/recorded-checks';
import type { AskCheckItem, AskCheckResult, DetectedDataRequest } from '@/lib/orchestrator/data-requests';

type Detect = (p: { candidateText: string; interviewerText: string | null; catalog: unknown }) => unknown;
export const askVia = (classify: Detect) => async (p: { what: string; catalog: AskCheckItem[] }): Promise<AskCheckResult | null> => {
  const found = await classify({ candidateText: `Could I get ${p.what}?`, interviewerText: null, catalog: p.catalog });
  if (found && typeof found === 'object' && !Array.isArray(found) && Array.isArray((found as AskCheckResult).items)) return found as AskCheckResult;
  return askResultOf((found ?? null) as DetectedDataRequest[] | null);
};
