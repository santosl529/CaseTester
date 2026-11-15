// Managing clubs and codes (`npm run clubs`, Lorenzo 14 Nov): add a club with a generated code, rotate a code (the
// old one retired, members stay), switch a club on or off, rename it, bring a retired code back, list everything.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClubsStore, ClubRow, CodeRow } from '@/lib/club-admin';

vi.mock('@/db/client', () => ({ db: {} }));
const { addClub, rotateCode, setClubActive, renameClub, unretireCode, listClubs, parseClubsArgs } = await import('@/lib/club-admin');

function memoryStore(): ClubsStore & { clubs: ClubRow[]; codes: CodeRow[] } {
  const clubs: ClubRow[] = [];
  const codes: CodeRow[] = [];
  const store: ClubsStore & { clubs: ClubRow[]; codes: CodeRow[] } = {
    clubs, codes,
    getClub: async id => clubs.find(c => c.id === id) ?? null,
    allClubs: async () => clubs.map(c => ({ ...c })),
    allCodes: async () => codes.map(c => ({ ...c })),
    insertClub: async c => { clubs.push({ ...c }); },
    insertCode: async (code, clubId, now) => {
      if (codes.some(c => c.code === code)) return false;
      codes.push({ code, clubId, createdAt: now, retiredAt: null });
      return true;
    },
    retireCodes: async (clubId, now) => {
      const live = codes.filter(c => c.clubId === clubId && !c.retiredAt);
      live.forEach(c => { c.retiredAt = now; });
      return live.map(c => c.code);
    },
    unretire: async code => { const c = codes.find(x => x.code === code); if (!c || !c.retiredAt) return null; c.retiredAt = null; return c.clubId; },
    setActive: async (id, active) => { clubs.find(c => c.id === id)!.active = active; },
    rename: async (id, name) => { clubs.find(c => c.id === id)!.name = name; },
    transaction: async fn => fn(store),
  };
  return store;
}

const now = new Date('2026-11-15T12:00:00Z');
let s: ReturnType<typeof memoryStore>;
beforeEach(() => { s = memoryStore(); });

describe('addClub', () => {
  it('a new club, switched on, with one generated code from its prefix', async () => {
    const r = await addClub(s, { id: 'everview', name: 'Everview' }, now);
    expect(r).toMatchObject({ ok: true });
    expect(s.clubs).toEqual([{ id: 'everview', name: 'Everview', active: true }]);
    expect(s.codes).toHaveLength(1);
    expect(s.codes[0].code).toMatch(/^EVERVIEW-[2-9A-HJKMNP-Z]{6}$/);
    if (r.ok) expect(r.code).toBe(s.codes[0].code);
  });
  it('--prefix sets the code prefix', async () => {
    const r = await addClub(s, { id: 'gcg', name: 'Global Consulting Group', prefix: 'GCG' }, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.code).toMatch(/^GCG-/);
  });
  it('refuses a taken id, a bad id or an empty name', async () => {
    await addClub(s, { id: 'cmc', name: 'CMC' }, now);
    expect(await addClub(s, { id: 'cmc', name: 'Again' }, now)).toEqual({ ok: false, error: 'club cmc already exists' });
    expect((await addClub(s, { id: 'Bad Id', name: 'X' }, now)).ok).toBe(false);
    expect((await addClub(s, { id: 'ok', name: '  ' }, now)).ok).toBe(false);
  });
  it('a generated code that collides is drawn again', async () => {
    let n = 0;
    const real = s.insertCode;
    s.insertCode = async (code, clubId, at) => (n++ === 0 ? false : real(code, clubId, at));
    const r = await addClub(s, { id: 'eiig', name: 'EIIG' }, now);
    expect(r.ok).toBe(true);
    expect(s.codes).toHaveLength(1);
  });
});

describe('rotateCode', () => {
  it('a new code; every current code of the club retired; the club untouched', async () => {
    const first = await addClub(s, { id: 'everview', name: 'Everview' }, now);
    const later = new Date('2026-12-01T00:00:00Z');
    const r = await rotateCode(s, 'everview', later);
    if (!r.ok || !first.ok) throw new Error('failed');
    expect(r.retired).toEqual([first.code]);
    expect(r.code).not.toBe(first.code);
    expect(s.codes.find(c => c.code === first.code)!.retiredAt).toEqual(later);
    expect(s.codes.find(c => c.code === r.code)!.retiredAt).toBeNull();
    expect(s.clubs[0].active).toBe(true);
  });
  it('an unknown club: refused', async () => {
    expect(await rotateCode(s, 'nope', now)).toEqual({ ok: false, error: 'no club nope' });
  });
});

describe('on / off / rename / unretire', () => {
  it('switch a club off and on; rename it', async () => {
    await addClub(s, { id: 'cmc', name: 'CMC' }, now);
    expect(await setClubActive(s, 'cmc', false)).toEqual({ ok: true });
    expect(s.clubs[0].active).toBe(false);
    await setClubActive(s, 'cmc', true);
    expect(s.clubs[0].active).toBe(true);
    expect(await renameClub(s, 'cmc', 'Consulting Club')).toEqual({ ok: true });
    expect(s.clubs[0].name).toBe('Consulting Club');
    expect((await setClubActive(s, 'nope', true)).ok).toBe(false);
    expect((await renameClub(s, 'cmc', ' ')).ok).toBe(false);
  });
  it('a retired code accepted again, typed in any case; an unknown or current one refused', async () => {
    s.clubs.push({ id: 'wharton2026', name: 'WHARTON2026', active: false });
    s.codes.push({ code: 'WHARTON2026', clubId: 'wharton2026', createdAt: now, retiredAt: now });
    expect(await unretireCode(s, ' wharton2026 ')).toEqual({ ok: true, clubId: 'wharton2026' });
    expect(s.codes[0].retiredAt).toBeNull();
    expect((await unretireCode(s, 'WHARTON2026')).ok).toBe(false);
    expect((await unretireCode(s, 'NOPE')).ok).toBe(false);
  });
});

describe('listClubs', () => {
  it('each club with its current codes and how many are retired', async () => {
    const a = await addClub(s, { id: 'everview', name: 'Everview' }, now);
    await rotateCode(s, 'everview', now);
    await addClub(s, { id: 'cmc', name: 'CMC' }, now);
    await setClubActive(s, 'cmc', false);
    const rows = await listClubs(s);
    expect(rows.map(r => [r.id, r.active, r.current.length, r.retired])).toEqual([['cmc', false, 1, 0], ['everview', true, 1, 1]]);
    expect(a.ok && rows[1].current.includes(a.code)).toBe(false);
  });
});

describe('parseClubsArgs', () => {
  it('reads each command', () => {
    expect(parseClubsArgs(['list'])).toEqual({ cmd: 'list' });
    expect(parseClubsArgs(['add', 'everview', '--name=Everview'])).toEqual({ cmd: 'add', id: 'everview', name: 'Everview', prefix: undefined });
    expect(parseClubsArgs(['add', 'gcg', '--name=Global Consulting Group', '--prefix=GCG'])).toEqual({ cmd: 'add', id: 'gcg', name: 'Global Consulting Group', prefix: 'GCG' });
    expect(parseClubsArgs(['rotate', 'gcg'])).toEqual({ cmd: 'rotate', id: 'gcg' });
    expect(parseClubsArgs(['on', 'gcg'])).toEqual({ cmd: 'on', id: 'gcg' });
    expect(parseClubsArgs(['off', 'gcg'])).toEqual({ cmd: 'off', id: 'gcg' });
    expect(parseClubsArgs(['rename', 'gcg', '--name=GCG'])).toEqual({ cmd: 'rename', id: 'gcg', name: 'GCG' });
    expect(parseClubsArgs(['unretire', 'WHARTON2026'])).toEqual({ cmd: 'unretire', code: 'WHARTON2026' });
  });
  it('anything else: usage', () => {
    expect(parseClubsArgs([])).toEqual({ cmd: 'usage' });
    expect(parseClubsArgs(['add', 'x'])).toEqual({ cmd: 'usage' });
    expect(parseClubsArgs(['rotate'])).toEqual({ cmd: 'usage' });
    expect(parseClubsArgs(['delete', 'x'])).toEqual({ cmd: 'usage' });
  });
});
