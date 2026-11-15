// An in-memory stand-in for lib/club-directory.ts (the clubs and club_codes tables). Each code given to setClubs,
// e.g. 'ALPHA', names the club { id: 'alpha', name: 'Alpha' }, switched on; a club left out is switched off.
//   vi.mock('@/lib/club-directory', () => import('../club/fake-club-directory'));
import type { Club, ClubDirectory } from '@/lib/club-directory';

const codes = new Map<string, Club>();
const clubs = new Map<string, Club>();

export function setClubs(codeList: string[]): void {
  codes.clear();
  clubs.clear();
  for (const code of codeList) {
    const club = { id: code.toLowerCase(), name: code[0] + code.slice(1).toLowerCase() };
    codes.set(code, club);
    clubs.set(club.id, club);
  }
}

export const clubDirectory: ClubDirectory = {
  byCode: async code => codes.get(code) ?? null,
  byId: async id => clubs.get(id) ?? null,
};

setClubs(['ALPHA', 'BETA']);
