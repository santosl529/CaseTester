// Drills screens' calls (8 Nov: "make everything fail clearly"): a drop-in for fetch that never throws and always
// carries a message the screen can show (they display `data.message`).
import { describe, it, expect } from 'vitest';
import { drillFetch } from '@/lib/drills/client-fetch';
import { OFFLINE } from '@/lib/site/failure-messages';

const via = (impl: () => Promise<Response>) => (async () => impl()) as unknown as typeof fetch;

describe('drillFetch', () => {
  it('ok: the body as is', async () => {
    const res = await drillFetch('/x', {}, via(async () => Response.json({ set_id: 's' })));
    expect([res.ok, res.status, await res.json()]).toEqual([true, 200, { set_id: 's' }]);
  });
  it("the server's own message on a 4xx it explains (e.g. a set already in progress)", async () => {
    const res = await drillFetch('/x', {}, via(async () => Response.json({ error: 'set_in_progress', message: 'Finish your current set first', set_id: 's' }, { status: 409 })));
    expect(await res.json()).toEqual({ error: 'set_in_progress', message: 'Finish your current set first', set_id: 's' });
  });
  it('the network fails: status 0 and the offline message', async () => {
    const res = await drillFetch('/x', {}, via(async () => { throw new TypeError('Failed to fetch'); }));
    expect([res.ok, res.status, await res.json()]).toEqual([false, 0, { error: 'network', message: OFFLINE }]);
  });
  it('signed out, or the club code no longer valid: what to do about it', async () => {
    expect(await (await drillFetch('/x', {}, via(async () => Response.json({ error: 'unauthorized', message: 'Sign in first' }, { status: 401 })))).json())
      .toEqual({ error: 'unauthorized', message: 'You’ve been signed out. Log in again to keep going; your progress is saved.' });
    expect(await (await drillFetch('/x', {}, via(async () => Response.json({ error: 'club_code_required', message: 'Enter your club code first' }, { status: 403 })))).json())
      .toEqual({ error: 'club_code_required', message: 'Your club code is no longer valid. Enter a new one on your Account page.' });
  });
  it('a 500 or an HTML error page: a plain "try again"', async () => {
    const generic = 'Something went wrong on our side. Please try again in a moment.';
    expect((await (await drillFetch('/x', {}, via(async () => Response.json({ error: 'server_error', message: 'Something went wrong' }, { status: 500 })))).json()).message).toBe(generic);
    expect(await (await drillFetch('/x', {}, via(async () => new Response('<html/>', { status: 502 })))).json()).toEqual({ error: 'server_error', message: generic });
  });
});
