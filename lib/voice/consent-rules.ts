// Voice consent, the rules (pure, so the voice screen can use them without reaching the database): see
// lib/voice/consent.ts for the record itself.

// The policy's "Last updated" date (app/(site)/voice-policy/page.tsx). Change both together when the policy changes.
export const VOICE_CONSENT_VERSION = '2026-11-12';

type ConsentRecord = { voiceConsentAt: Date | null; voiceConsentVersion: string | null };

export function hasVoiceConsent(p: ConsentRecord | null | undefined): boolean {
  return Boolean(p?.voiceConsentAt) && p?.voiceConsentVersion === VOICE_CONSENT_VERSION;
}

// The consent POST: the box checked ({ agree: true }) for the version the page showed. A page from before a policy
// change says so (stale_policy) rather than recording consent to a text the student didn't see.
export function parseVoiceConsent(body: unknown): { ok: true; version: string } | { ok: false; error: 'consent_required' | 'stale_policy' } {
  const b = body as { agree?: unknown; version?: unknown } | null;
  if (!b || b.agree !== true) return { ok: false, error: 'consent_required' };
  if (b.version !== VOICE_CONSENT_VERSION) return { ok: false, error: 'stale_policy' };
  return { ok: true, version: VOICE_CONSENT_VERSION };
}
