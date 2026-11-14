// Where /sign-in sends a student once signed in with a valid club code
// (site launch, 31 Oct): `next` when it is a path on this site, else Today
// (/drills, Matt 13 Nov; it sends a student with no training set up to setup).
// Only a single "/" followed by a path character passes: "//host", "/\host",
// encoded slashes or backslashes, control characters and any scheme fall back,
// so it can never be an open redirect. /sign-in itself falls back too (a loop).
const SAFE = /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@/?#%]*$/;

export const SIGNED_IN_HOME = '/drills';

export function safeNext(next: string | string[] | undefined): string {
  if (typeof next !== 'string' || !SAFE.test(next)) return SIGNED_IN_HOME;
  if (/%(2f|5c)/i.test(next)) return SIGNED_IN_HOME;
  if (next === '/sign-in' || next.startsWith('/sign-in?') || next.startsWith('/sign-in#') || next.startsWith('/sign-in/')) return SIGNED_IN_HOME;
  return next;
}
