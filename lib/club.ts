// The club-code gate (technical PRD §12 step 1: "Auth + club-code gate").
// Shared by sign-up, /api/club (the club step), /account and /api/session, and
// by every page and route that requires a club (home, drills, case start).
//
// Since 14 Nov (Lorenzo: "a club to clubcode table so it's easy to rotate codes") codes live in the database
// (lib/club-directory.ts; was the CLUB_CODES env var) and name a club; the student's profile records the club id
// (org_id), not the code. Rotating a code leaves members in; switching a club off shuts them out.
import { randomInt } from 'node:crypto';
import { db } from '@/db/client';
import { eq } from 'drizzle-orm';
import { studentProfiles } from '@/db/schema';
import { logEvent } from '@/lib/analytics';
import { clubDirectory, type Club } from '@/lib/club-directory';
import { noteWrongClubCode } from '@/lib/club-alert';

export type { Club };

const MAX_CODE = 64;

export function normalizeClubCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

// The club a typed code names, or null (unknown, retired, its club switched off, or nothing typed). A wrong code
// counts toward the site-wide wrong-code alert (lib/club-alert.ts); an empty box doesn't.
export async function clubForCode(raw: unknown): Promise<Club | null> {
  const code = normalizeClubCode(raw);
  if (!code) return null;
  const club = code.length > MAX_CODE ? null : await clubDirectory.byCode(code);
  if (!club) await noteWrongClubCode();
  return club;
}

// The club while it is switched on, or null.
export async function activeClub(orgId: string | null | undefined): Promise<Club | null> {
  return orgId ? clubDirectory.byId(orgId) : null;
}

// Set once: the first accepted code's club is the student's org.
export async function recordStudentOrg(userId: string, orgId: string): Promise<void> {
  await db.insert(studentProfiles).values({ userId, orgId }).onConflictDoNothing();
}

// The club on the student's profile while it is switched on, or null: returning students skip the club step
// (site flow, 19 Oct), and a club switched off stops letting them in.
export async function storedClubOrg(userId: string): Promise<string | null> {
  const [profile] = await db.select({ orgId: studentProfiles.orgId }).from(studentProfiles).where(eq(studentProfiles.userId, userId));
  return (await activeClub(profile?.orgId))?.id ?? null;
}

// New codes: the club's prefix, a dash, six characters without look-alikes (no 0/O, 1/I/L) — about 887 million per
// club, so guessing is hopeless even spread over many addresses (14 Nov).
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function generateClubCode(prefix: string): string {
  const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let tail = '';
  for (let i = 0; i < 6; i++) tail += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${p}-${tail}`;
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
