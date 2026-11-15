// Managing clubs and their codes (Lorenzo, 14 Nov: "a club to clubcode table so it's easy to rotate codes"), behind
// `npm run clubs` (scripts/clubs.ts). Behind a small store so tests run in memory; dbClubsStore is the real one.
//   add <id> --name=<name> [--prefix=<P>]   a new club, switched on, with a generated code (P-XXXXXX)
//   rotate <id>                             a new code; the club's current codes retired (members stay in)
//   on <id> | off <id>                      switch a club on or off (off shuts its members out)
//   rename <id> --name=<name>               the name students see
//   unretire <CODE>                         accept a retired code again (e.g. a pre-migration code still in use)
//   list                                    clubs, their current codes, how many retired
import { and, asc, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { clubCodes, clubs } from '@/db/schema';
import { generateClubCode, normalizeClubCode } from '@/lib/club';

export type ClubRow = { id: string; name: string; active: boolean };
export type CodeRow = { code: string; clubId: string; createdAt: Date; retiredAt: Date | null };

export type ClubsStore = {
  getClub(id: string): Promise<ClubRow | null>;
  allClubs(): Promise<ClubRow[]>;
  allCodes(): Promise<CodeRow[]>;
  insertClub(c: ClubRow): Promise<void>;
  insertCode(code: string, clubId: string, now: Date): Promise<boolean>;   // false: the code is taken
  retireCodes(clubId: string, now: Date): Promise<string[]>;              // the codes retired
  unretire(code: string): Promise<string | null>;                          // the club id, or null (unknown / current)
  setActive(id: string, active: boolean): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  transaction<T>(fn: (s: ClubsStore) => Promise<T>): Promise<T>;
};

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;

async function newCode(s: ClubsStore, prefix: string, clubId: string, now: Date): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateClubCode(prefix);
    if (await s.insertCode(code, clubId, now)) return code;
  }
  throw new Error('could not draw an unused code in 5 tries');
}

export async function addClub(s: ClubsStore, a: { id: string; name: string; prefix?: string }, now: Date): Promise<Result<{ code: string }>> {
  if (!ID.test(a.id)) return { ok: false, error: `club id "${a.id}": lower-case letters, digits and dashes, 2–40 characters` };
  const name = a.name.trim();
  if (!name) return { ok: false, error: 'a club needs a name (--name=...)' };
  return s.transaction(async t => {
    if (await t.getClub(a.id)) return { ok: false as const, error: `club ${a.id} already exists` };
    await t.insertClub({ id: a.id, name, active: true });
    return { ok: true as const, code: await newCode(t, a.prefix ?? a.id, a.id, now) };
  });
}

export async function rotateCode(s: ClubsStore, id: string, now: Date): Promise<Result<{ code: string; retired: string[] }>> {
  return s.transaction(async t => {
    if (!(await t.getClub(id))) return { ok: false as const, error: `no club ${id}` };
    const retired = await t.retireCodes(id, now);
    const prefix = retired[0]?.split('-')[0] ?? id;
    return { ok: true as const, code: await newCode(t, prefix, id, now), retired };
  });
}

export async function setClubActive(s: ClubsStore, id: string, active: boolean): Promise<Result> {
  if (!(await s.getClub(id))) return { ok: false, error: `no club ${id}` };
  await s.setActive(id, active);
  return { ok: true };
}

export async function renameClub(s: ClubsStore, id: string, name: string): Promise<Result> {
  if (!name.trim()) return { ok: false, error: 'a club needs a name (--name=...)' };
  if (!(await s.getClub(id))) return { ok: false, error: `no club ${id}` };
  await s.rename(id, name.trim());
  return { ok: true };
}

export async function unretireCode(s: ClubsStore, raw: string): Promise<Result<{ clubId: string }>> {
  const code = normalizeClubCode(raw);
  const clubId = code ? await s.unretire(code) : null;
  return clubId ? { ok: true, clubId } : { ok: false, error: `${code || '(empty)'} is not a retired code` };
}

export async function listClubs(s: ClubsStore): Promise<(ClubRow & { current: string[]; retired: number })[]> {
  const [all, codes] = await Promise.all([s.allClubs(), s.allCodes()]);
  return all.sort((a, b) => a.id.localeCompare(b.id)).map(c => ({
    ...c,
    current: codes.filter(x => x.clubId === c.id && !x.retiredAt).map(x => x.code),
    retired: codes.filter(x => x.clubId === c.id && x.retiredAt).length,
  }));
}

export type ClubsCommand =
  | { cmd: 'list' } | { cmd: 'usage' }
  | { cmd: 'add'; id: string; name: string; prefix: string | undefined }
  | { cmd: 'rotate' | 'on' | 'off'; id: string }
  | { cmd: 'rename'; id: string; name: string }
  | { cmd: 'unretire'; code: string };

export function parseClubsArgs(argv: string[]): ClubsCommand {
  const [cmd, target, ...rest] = argv;
  const opt = (k: string) => rest.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  if (cmd === 'list') return { cmd };
  if (!target) return { cmd: 'usage' };
  if (cmd === 'add') { const name = opt('name'); return name ? { cmd, id: target, name, prefix: opt('prefix') } : { cmd: 'usage' }; }
  if (cmd === 'rotate' || cmd === 'on' || cmd === 'off') return { cmd, id: target };
  if (cmd === 'rename') { const name = opt('name'); return name ? { cmd, id: target, name } : { cmd: 'usage' }; }
  if (cmd === 'unretire') return { cmd, code: target };
  return { cmd: 'usage' };
}

type Exec = Pick<typeof db, 'select' | 'insert' | 'update'>;
function storeOn(x: Exec, tx: (fn: (e: Exec) => Promise<unknown>) => Promise<unknown>): ClubsStore {
  const store: ClubsStore = {
    getClub: async id => (await x.select({ id: clubs.id, name: clubs.name, active: clubs.active }).from(clubs).where(eq(clubs.id, id)))[0] ?? null,
    allClubs: async () => x.select({ id: clubs.id, name: clubs.name, active: clubs.active }).from(clubs),
    allCodes: async () => x.select({ code: clubCodes.code, clubId: clubCodes.clubId, createdAt: clubCodes.createdAt, retiredAt: clubCodes.retiredAt }).from(clubCodes).orderBy(asc(clubCodes.createdAt)),
    insertClub: async c => { await x.insert(clubs).values(c); },
    insertCode: async (code, clubId, now) => (await x.insert(clubCodes).values({ code, clubId, createdAt: now }).onConflictDoNothing().returning({ code: clubCodes.code })).length === 1,
    retireCodes: async (clubId, now) => (await x.update(clubCodes).set({ retiredAt: now })
      .where(and(eq(clubCodes.clubId, clubId), isNull(clubCodes.retiredAt))).returning({ code: clubCodes.code })).map(r => r.code),
    unretire: async code => (await x.update(clubCodes).set({ retiredAt: null })
      .where(and(eq(clubCodes.code, code), isNotNull(clubCodes.retiredAt))).returning({ clubId: clubCodes.clubId }))[0]?.clubId ?? null,
    setActive: async (id, active) => { await x.update(clubs).set({ active }).where(eq(clubs.id, id)); },
    rename: async (id, name) => { await x.update(clubs).set({ name }).where(eq(clubs.id, id)); },
    transaction: async fn => tx(e => fn(storeOn(e, f => f(e)))) as never,
  };
  return store;
}

export const dbClubsStore: ClubsStore = storeOn(db, fn => db.transaction(t => fn(t)));
