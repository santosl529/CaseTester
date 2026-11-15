// The clubs and codes tables, read (db/schema.ts clubs, club_codes; migration 0028). Its own module so tests swap
// it for an in-memory list (tests/club/club-codes.test.ts) without faking the database.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { clubCodes, clubs } from '@/db/schema';

export type Club = { id: string; name: string };

export type ClubDirectory = {
  // The club a current code names, while the club is switched on; null otherwise. `code` is already normalized.
  byCode(code: string): Promise<Club | null>;
  // The club, while it is switched on; null otherwise.
  byId(id: string): Promise<Club | null>;
};

export const clubDirectory: ClubDirectory = {
  async byCode(code) {
    const [row] = await db.select({ id: clubs.id, name: clubs.name }).from(clubCodes)
      .innerJoin(clubs, eq(clubs.id, clubCodes.clubId))
      .where(and(eq(clubCodes.code, code), isNull(clubCodes.retiredAt), eq(clubs.active, true)));
    return row ?? null;
  },
  async byId(id) {
    const [row] = await db.select({ id: clubs.id, name: clubs.name }).from(clubs).where(and(eq(clubs.id, id), eq(clubs.active, true)));
    return row ?? null;
  },
};
