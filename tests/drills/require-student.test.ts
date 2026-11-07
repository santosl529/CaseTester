// Drills' gate (security audit, 6 Nov): a student whose club code has been removed from CLUB_CODES is shut out of
// drills as they already are from cases (/home, /start and /api/session re-check the stored code).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ userId: 'u1' as string | null, profile: { userId: 'u1', orgId: 'ALPHA' } as Record<string, unknown> | undefined }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ auth: { getClaims: async () => ({ data: h.userId ? { claims: { sub: h.userId } } : null, error: null }) } }) }));
vi.mock('@/db/client', () => ({ db: { select: () => ({ from: () => ({ where: async () => (h.profile ? [h.profile] : []) }) }) } }));

const { requireStudent } = await import('@/lib/drills/http');

beforeEach(() => {
  process.env.CLUB_CODES = 'ALPHA,BETA';
  h.userId = 'u1';
  h.profile = { userId: 'u1', orgId: 'ALPHA' };
});

describe('requireStudent', () => {
  it('signed in with a profile whose club code is still valid: the student', async () => {
    expect(await requireStudent()).toBe('u1');
  });
  it('not signed in: 401', async () => {
    h.userId = null;
    await expect(requireStudent()).rejects.toMatchObject({ status: 401 });
  });
  it('no profile: club code required', async () => {
    h.profile = undefined;
    await expect(requireStudent()).rejects.toMatchObject({ status: 403, code: 'club_code_required' });
  });
  it('the club code was removed from CLUB_CODES: club code required', async () => {
    process.env.CLUB_CODES = 'BETA';
    await expect(requireStudent()).rejects.toMatchObject({ status: 403, code: 'club_code_required' });
  });
});
