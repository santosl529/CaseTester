// The M0 Phase B voice worker (spec 2026-10-08-voice-phase-b §3). Registers
// with the LiveKit server (LIVEKIT_URL / _API_KEY / _API_SECRET) for explicit
// dispatch as AGENT_NAME; each job runs lib/voice/livekit-agent.ts in its own
// process (forked with tsx's loader). Run: npm run voice:agent
import path from 'node:path';
import { cli, WorkerOptions } from '@livekit/agents';
import { AGENT_NAME } from '@/lib/voice/protocol';
import { loadCases } from '@/lib/cases/loader';
import { liveKitEnvProblem } from '@/lib/voice/livekit-env';

// Lorenzo, 28 Oct: the D2 guard and the active switch list at worker start (loadCases runs both), so a worker with
// ENGINE_SWITCHES and no production opt-in refuses to start instead of failing every job.
loadCases();

// Local voice isolation (5 Nov): a local worker on production's LiveKit project would register as a second
// case-interviewer there and take production's dispatches. Refused outside production (lib/voice/livekit-env.ts).
const envProblem = liveKitEnvProblem(process.env);
if (envProblem) {
  console.error(`[voice-agent] ${envProblem}`);
  process.exit(1);
}

cli.runApp(new WorkerOptions({ agent: path.resolve('lib/voice/livekit-agent.ts'), agentName: AGENT_NAME }));
