import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfiles } from '@/db/schema';

// Voice consent (Lorenzo, 14 Nov: "add the box"; Matt's Voice and Biometric Data Policy): before the first voice
// interview the student checks a box and confirms; that record (when, and which policy version) is kept on their
// profile and deleted with the account. The token route refuses to start voice without a record for the current
// version, so a changed policy asks again. Withdrawing is switching to text or ending the session (the policy).

import { hasVoiceConsent } from '@/lib/voice/consent-rules';
export { VOICE_CONSENT_VERSION, hasVoiceConsent, parseVoiceConsent } from '@/lib/voice/consent-rules';

export async function voiceConsentFor(userId: string, exec: Pick<typeof db, 'select'> = db): Promise<boolean> {
  const [p] = await exec.select({ voiceConsentAt: studentProfiles.voiceConsentAt, voiceConsentVersion: studentProfiles.voiceConsentVersion })
    .from(studentProfiles).where(eq(studentProfiles.userId, userId));
  return hasVoiceConsent(p);
}

// Records consent on the student's profile; false when there is no profile (signed in without a club, which can't
// start an interview anyway).
export async function recordVoiceConsent(userId: string, version: string, now: Date, exec: Pick<typeof db, 'update'> = db): Promise<boolean> {
  const rows = await exec.update(studentProfiles).set({ voiceConsentAt: now, voiceConsentVersion: version })
    .where(eq(studentProfiles.userId, userId)).returning({ userId: studentProfiles.userId });
  return rows.length > 0;
}
