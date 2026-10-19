// The club-code gate (technical PRD §12 step 1: "Auth + club-code gate").
// Shared by /api/club, which checks the code at the club step and records the
// student's org (docs/prd-drills.md "org_id"), and /api/session, which still
// checks it on case start so the case flow is gated exactly as before.
import { db } from '@/db/client';
import { eq } from 'drizzle-orm';
import { studentProfiles } from '@/db/schema';

// The org id for a valid club code, or null.
export function clubOrgId(clubCode: unknown): string | null {
  const code = typeof clubCode === 'string' ? clubCode.trim().toUpperCase() : '';
  const validCodes = (process.env.CLUB_CODES ?? '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  return code && validCodes.includes(code) ? code : null;
}

// Set once: the first accepted code is the student's org.
export async function recordStudentOrg(userId: string, orgId: string): Promise<void> {
  await db.insert(studentProfiles).values({ userId, orgId }).onConflictDoNothing();
}

// The code on the student's profile while it is still a valid club code, or
// null: returning students skip the club step (site flow, 19 Oct), and a code
// removed from CLUB_CODES stops letting them in.
export async function storedClubOrg(userId: string): Promise<string | null> {
  const [profile] = await db.select({ orgId: studentProfiles.orgId }).from(studentProfiles).where(eq(studentProfiles.userId, userId));
  return clubOrgId(profile?.orgId);
}
