// "Make everything fail clearly" (Lorenzo, 8 Nov). Route wrappers so a failure reaches the browser as JSON it can
// explain: a throw anywhere in a handler → 500 { error: 'server_error' } (logged), never Next's HTML error page;
// an interview id that isn't a UUID → 404 before any lookup (Postgres would refuse it with a 500).
import { NextResponse } from 'next/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

function serverError(err: unknown): NextResponse {
  console.error('[route] unhandled error', err);
  return NextResponse.json({ error: 'server_error' }, { status: 500 });
}

export function jsonRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try { return await handler(...args); } catch (err) { return serverError(err); }
  };
}

type SessionCtx = { params: Promise<{ sessionId: string }> };
export function sessionRoute<R>(handler: (req: R, ctx: SessionCtx) => Promise<Response>) {
  return async (req: R, ctx: SessionCtx): Promise<Response> => {
    try {
      if (!isUuid((await ctx.params).sessionId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return await handler(req, ctx);
    } catch (err) { return serverError(err); }
  };
}
