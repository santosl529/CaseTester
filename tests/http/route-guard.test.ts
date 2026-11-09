// "Make everything fail clearly" (Lorenzo, 8 Nov): a route that throws answers JSON (the client can explain it),
// not Next's HTML 500; an interview id that isn't a UUID is a 404, not a Postgres error.
import { describe, it, expect, vi } from 'vitest';
import { isUuid, jsonRoute, sessionRoute } from '@/lib/http/route-guard';

const ID = '11111111-1111-4111-8111-111111111111';
const ctx = (sessionId: string) => ({ params: Promise.resolve({ sessionId }) });
const req = () => new Request('http://x', { method: 'POST' }) as never;

describe('isUuid', () => {
  it('accepts a UUID, refuses anything else', () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(ID.toUpperCase())).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(`${ID}x`)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('jsonRoute', () => {
  it('passes the answer through', async () => {
    const res = await jsonRoute<[unknown]>(async () => Response.json({ ok: true }))(req());
    expect(await res.json()).toEqual({ ok: true });
  });
  it('a throw: 500 { error: "server_error" } as JSON, logged', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await jsonRoute<[unknown]>(async (): Promise<Response> => { throw new Error('db down'); })(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_error' });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('sessionRoute', () => {
  it('a valid id: the handler runs with it', async () => {
    const h = vi.fn(async (_r: unknown, c: { params: Promise<{ sessionId: string }> }) => Response.json({ id: (await c.params).sessionId }));
    const res = await sessionRoute(h)(req(), ctx(ID));
    expect(await res.json()).toEqual({ id: ID });
  });
  it('an id that is not a UUID: 404 { error: "Not found" }, the handler never runs', async () => {
    const h = vi.fn();
    const res = await sessionRoute(h)(req(), ctx('abc'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(h).not.toHaveBeenCalled();
  });
  it('a throw: JSON 500', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await sessionRoute(async () => { throw new Error('llm'); })(req(), ctx(ID));
    expect(res.status).toBe(500);
    err.mockRestore();
  });
});
