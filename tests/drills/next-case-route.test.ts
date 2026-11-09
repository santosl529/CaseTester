// The drills "Next case" card (8 Nov audit: it redirected to the marketing page): a startable case opens its start
// page; anything else lands on the cases on /home.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/drills/http', () => ({ requireStudent: async () => 'u1' }));
vi.mock('@/lib/drills/events', () => ({ logDrillEvent: async () => {} }));
vi.mock('@/lib/cases/listed', () => ({ isStartableCase: (id: unknown) => id === 'prof-001' }));
const { GET } = await import('@/app/api/drills/next-case/route');
const where = async (q: string) => new URL((await GET(new Request(`http://x/api/drills/next-case${q}`))).headers.get('location')!).pathname + new URL((await GET(new Request(`http://x/api/drills/next-case${q}`))).headers.get('location')!).hash;

describe('GET /api/drills/next-case', () => {
  it('a startable case: its start page', async () => { expect(await where('?case=prof-001')).toBe('/start/prof-001'); });
  it('an unknown or missing case: the cases on /home', async () => {
    expect(await where('?case=nope')).toBe('/home#cases');
    expect(await where('')).toBe('/home#cases');
  });
});
