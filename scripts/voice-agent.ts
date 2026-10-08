// The M0 Phase B voice worker (spec 2026-10-08-voice-phase-b §3). Registers
// with the LiveKit server (LIVEKIT_URL / _API_KEY / _API_SECRET) for explicit
// dispatch as AGENT_NAME; each job runs lib/voice/livekit-agent.ts in its own
// process (forked with tsx's loader). Run: npm run voice:agent
import path from 'node:path';
import { cli, WorkerOptions } from '@livekit/agents';
import { AGENT_NAME } from '@/lib/voice/protocol';

cli.runApp(new WorkerOptions({ agent: path.resolve('lib/voice/livekit-agent.ts'), agentName: AGENT_NAME }));
