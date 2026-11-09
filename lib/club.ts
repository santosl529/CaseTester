// The club-code gate (technical PRD §12 step 1: "Auth + club-code gate").
// Shared by /api/club, which checks the code at the club step and records the
// student's org (docs/prd-drills.md "org_id"), and /api/session, which still
// checks it on case start so the case flow is gated exactly as before.
import { db } from '@/db/client';
import { eq } from 'drizzle-orm';
import { studentProfiles } from '@/db/schema';
import { logEvent } from '@/lib/analytics';

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

// Set or change the student's club (Lorenzo, 9 Nov: students can change their club code; for future club
// statistics, "record now, decide later"). The new club applies from now; every change is logged with its date as
// club_changed { from, to }, so history can later be counted with the old club or the new. The same club: no-op.
// Used by sign-up, the club step and /account (recordStudentOrg, set-once, stays for /api/session).
export type AssignClubDeps = {
  read: (userId: string) => Promise<string | null>;
  write: (userId: string, orgId: string) => Promise<void>;
  logEvent: (type: string, payload: Record<string, unknown>, ids: { userId: string }) => Promise<void>;
};

const assignDeps: AssignClubDeps = {
  read: async userId => (await db.select({ orgId: studentProfiles.orgId }).from(studentProfiles).where(eq(studentProfiles.userId, userId)))[0]?.orgId ?? null,
  write: async (userId, orgId) => {
    await db.insert(studentProfiles).values({ userId, orgId }).onConflictDoUpdate({ target: studentProfiles.userId, set: { orgId } });
  },
  logEvent,
};

export async function assignClub(userId: string, orgId: string, deps: AssignClubDeps = assignDeps): Promise<{ changed: boolean; from: string | null }> {
  const from = await deps.read(userId);
  if (from === orgId) return { changed: false, from };
  await deps.write(userId, orgId);
  await deps.logEvent('club_changed', { from, to: orgId }, { userId });
  return { changed: true, from };
}
