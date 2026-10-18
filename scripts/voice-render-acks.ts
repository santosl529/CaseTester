// Pre-render the acknowledgment clips (voice deploy, 18 Oct) into
// assets/voice/acks — tracked, so they ship in the worker's image and the
// hosted worker synthesizes nothing at cold start (VOICE_ACK_SYNTH=0). Run it
// after a change of voice, model or ack wording, and commit the clips.
//
// Paid: Cartesia characters, one render per beat not already shipped; --dry
// prints what would render and the count. Checked against --cap and added to
// the monthly ledger.
//
//   npx tsx --env-file=.env.local scripts/voice-render-acks.ts --dry
//   npx tsx --env-file=.env.local scripts/voice-render-acks.ts --cap=<chars>
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ackClipFile, ackClipTexts, loadAcks, SHIPPED_ACKS_DIR } from '@/lib/voice/ack-audio';
import { CARTESIA_MODEL, CartesiaTTS, defaultVoiceId } from '@/lib/voice/cartesia';
import { RunCharCap } from '@/lib/voice/tts-budget';

const DRY = process.argv.includes('--dry');
const CAP = Number(process.argv.find(a => a.startsWith('--cap='))?.slice(6));
const RATE = 24000;   // the agent's output rate

async function main() {
  const voice = await defaultVoiceId();
  const ttsName = `cartesia-${CARTESIA_MODEL}`;
  const todo = ackClipTexts().filter(t => !existsSync(path.join(SHIPPED_ACKS_DIR, ackClipFile(ttsName, voice, t))));
  const chars = todo.reduce((n, t) => n + t.length, 0);
  console.log(`${ttsName} · voice ${voice}: ${ackClipTexts().length} clips, ${todo.length} to render, ${chars} characters`);
  for (const t of todo) console.log(`  ${t}`);
  if (DRY || todo.length === 0) return;
  if (!(CAP > 0) || chars > CAP) throw new Error(`--cap=${CAP} must cover ${chars} characters`);
  const run = new RunCharCap(CAP);
  const ledger = await (await import('@/lib/voice/tts-ledger-store')).openTtsLedger(0);
  const tts = new CartesiaTTS(voice);
  await tts.connect();
  await loadAcks(tts, voice, n => run.take(n) && ledger.take(n), { sampleRate: RATE, cacheDir: SHIPPED_ACKS_DIR, shippedDir: null });
  tts.close();
  await ledger.flush();
  const left = ackClipTexts().filter(t => !existsSync(path.join(SHIPPED_ACKS_DIR, ackClipFile(ttsName, voice, t))));
  console.log(`rendered ${run.used} characters (monthly ledger now ${ledger.used}); ${left.length ? `still missing: ${left.join(' | ')}` : `all clips in ${SHIPPED_ACKS_DIR}`}`);
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
