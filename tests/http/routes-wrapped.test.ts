// Every interview route is wrapped (lib/http/route-guard.ts): a malformed id is a JSON 404 before any lookup.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: () => { throw new Error('the database must not be reached'); } }) }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }) }));

const routes: [string, () => Promise<Record<string, unknown>>][] = [
  ['channel turn', () => import('@/app/api/channel/[sessionId]/turn/route')],
  ['channel end', () => import('@/app/api/channel/[sessionId]/end/route')],
  ['channel finalize', () => import('@/app/api/channel/[sessionId]/finalize/route')],
  ['channel score', () => import('@/app/api/channel/[sessionId]/score/route')],
  ['channel silence', () => import('@/app/api/channel/[sessionId]/silence/route')],
  ['voice token', () => import('@/app/api/voice/[sessionId]/token/route')],
  ['voice end', () => import('@/app/api/voice/[sessionId]/end/route')],
  ['voice leave', () => import('@/app/api/voice/[sessionId]/leave/route')],
  ['feedback', () => import('@/app/api/feedback/[sessionId]/route')],
  ['report pdf', () => import('@/app/api/report/[sessionId]/pdf/route')],
];

describe.each(routes)('%s', (_name, load) => {
  it('an id that is not a UUID: JSON 404', async () => {
    const mod = await load();
    const handler = (mod.POST ?? mod.GET) as (r: unknown, c: unknown) => Promise<Response>;
    const res = await handler(new Request('http://x', { method: 'POST', body: '{}' }), { params: Promise.resolve({ sessionId: "1' OR 1=1" }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});
