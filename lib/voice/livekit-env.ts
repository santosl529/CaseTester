// Local voice isolation (voice lifecycle, 5 Nov; Lorenzo: "npm run dev + npm run voice:agent never touch
// production's rooms or cap"). Local development uses its own LiveKit project: LIVEKIT_URL / LIVEKIT_API_KEY /
// LIVEKIT_API_SECRET in .env.local point at it (docs/voice-deploy.md "Local development"). Outside production, a
// LIVEKIT_URL on production's project is refused — the local worker would register as a second
// `case-interviewer` there (taking production's dispatches) and a local Start would count against production's cap.
// VOICE_DEV_ALLOW_PROD_LIVEKIT=1 overrides it, deliberately.

// Production's LiveKit Cloud project (livekit.toml `[project] subdomain`; not a secret).
export const PRODUCTION_LIVEKIT_SUBDOMAIN = 'case-tester-t1foysn4';

// null when fine; otherwise why this environment must not use this LiveKit project.
export function liveKitEnvProblem(env: Record<string, string | undefined>): string | null {
  if (env.NODE_ENV === 'production') return null;
  if (env.VOICE_DEV_ALLOW_PROD_LIVEKIT === '1') return null;
  const url = env.LIVEKIT_URL ?? '';
  let host = '';
  try { host = new URL(url.replace(/^ws/, 'http')).hostname; } catch { return null; }
  if (host.split('.')[0] !== PRODUCTION_LIVEKIT_SUBDOMAIN) return null;
  return `LIVEKIT_URL points at production's LiveKit project (${host}) outside production. Local voice uses its own project — see docs/voice-deploy.md "Local development" — or set VOICE_DEV_ALLOW_PROD_LIVEKIT=1 to use production's on purpose.`;
}
