// Getting the report after an interview (text, voice, and "Prepare my report"). finalize waits for a last math
// check (≤30 s), then score. The score route runs one pass per session (lib/scoring/scoring-claim.ts — never
// charged twice); while another pass is running (a second tab, or a pass that outlived its request) it answers 409
// "Scoring in progress". That, a gateway timeout or a dropped connection isn't a failure: say it's still preparing,
// wait, ask again — up to ~10 minutes. A real error gets one retry.
import { postJson, type JsonAnswer } from '@/lib/site/fetch-json';

export type ScoringDeps = {
  request: (url: string) => Promise<JsonAnswer>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onScoring?: () => void;   // finalize is done; scoring has started
  onWaiting?: () => void;
};

const WAIT_MS = 15_000;
const GIVE_UP_MS = 10 * 60_000;

const stillRunning = (a: JsonAnswer) => (a.status === 409 && a.data?.error === 'Scoring in progress') || a.status === 0 || a.status === 502 || a.status === 503 || a.status === 504;

export async function runScoring(sessionId: string, deps: ScoringDeps = browserDeps): Promise<'ready' | 'failed'> {
  const base = `/api/channel/${encodeURIComponent(sessionId)}`;
  await deps.request(`${base}/finalize`);
  deps.onScoring?.();
  const start = deps.now();
  let errors = 0;
  for (;;) {
    const a = await deps.request(`${base}/score`);
    if (a.ok) return 'ready';
    if (stillRunning(a)) {
      if (deps.now() - start >= GIVE_UP_MS) return 'failed';
      deps.onWaiting?.();
      await deps.sleep(WAIT_MS);
      continue;
    }
    if (++errors >= 2) return 'failed';
  }
}

const browserDeps: ScoringDeps = {
  request: url => postJson(url),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  now: () => Date.now(),
};
