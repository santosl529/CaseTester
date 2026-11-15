// Club codes in the database (Lorenzo, 14 Nov: "a club to clubcode table so it's easy to rotate codes"). A code
// names a club; the student's profile records the club, not the code — rotating a code leaves members in, switching
// a club off shuts them out. Codes: the club's prefix, a dash, six characters without look-alikes.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  codes: new Map<string, { id: string; name: string }>(),
  clubs: new Map<string, { id: string; name: string }>(),
  byCodeCalls: 0,
  profile: [] as { orgId: string | null }[],
}));
vi.mock('@/lib/club-directory', () => ({
  clubDirectory: {
    byCode: async (code: string) => { h.byCodeCalls++; return h.codes.get(code) ?? null; },
    byId: async (id: string) => h.clubs.get(id) ?? null,
  },
}));
vi.mock('@/db/client', () => ({ db: { select: () => ({ from: () => ({ where: async () => h.profile }) }) } }));

const { normalizeClubCode, clubForCode, activeClub, storedClubOrg, generateClubCode, CODE_ALPHABET } = await import('@/lib/club');

const everview = { id: 'everview', name: 'Everview' };
beforeEach(() => {
  h.codes = new Map([['EVERVIEW-JCSJ8S', everview]]);
  h.clubs = new Map([['everview', everview]]);
  h.byCodeCalls = 0;
  h.profile = [];
});

describe('normalizeClubCode', () => {
  it('trims and upper-cases; anything but a string is empty', () => {
    expect(normalizeClubCode('  everview-jcsj8s ')).toBe('EVERVIEW-JCSJ8S');
    expect(normalizeClubCode(42)).toBe('');
    expect(normalizeClubCode(undefined)).toBe('');
  });
});

describe('clubForCode', () => {
  it('a current code, typed in any case, names its club', async () => {
    expect(await clubForCode('everview-jcsj8s')).toEqual(everview);
  });
  it('an unknown or retired code: null', async () => {
    expect(await clubForCode('EVERVIEW-AAAAAA')).toBeNull();
  });
  it('nothing typed: null, without a lookup', async () => {
    expect(await clubForCode('  ')).toBeNull();
    expect(await clubForCode(undefined)).toBeNull();
    expect(h.byCodeCalls).toBe(0);
  });
  it('an over-long code is refused without a lookup', async () => {
    expect(await clubForCode('X'.repeat(65))).toBeNull();
    expect(h.byCodeCalls).toBe(0);
  });
});

describe('activeClub and storedClubOrg', () => {
  it('a club that is switched on; null for one switched off, unknown, or none', async () => {
    expect(await activeClub('everview')).toEqual(everview);
    expect(await activeClub('wharton')).toBeNull();
    expect(await activeClub(null)).toBeNull();
    expect(await activeClub(undefined)).toBeNull();
  });
  it('the profile’s club while it is switched on — whatever happened to the code it was joined with', async () => {
    h.profile = [{ orgId: 'everview' }];
    h.codes.clear();   // the code was rotated away
    expect(await storedClubOrg('u1')).toBe('everview');
    h.clubs.clear();   // the club was switched off
    expect(await storedClubOrg('u1')).toBeNull();
    h.profile = [];
    expect(await storedClubOrg('u1')).toBeNull();
  });
});

describe('generateClubCode', () => {
  it('PREFIX-XXXXXX from the alphabet without look-alikes', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateClubCode('Everview');
      expect(code).toMatch(new RegExp(`^EVERVIEW-[${CODE_ALPHABET}]{6}$`));
    }
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });
  it('the prefix keeps letters and digits only', () => {
    expect(generateClubCode('g.c.g club')).toMatch(/^GCGCLUB-/);
  });
});
