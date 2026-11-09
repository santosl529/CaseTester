// Deleting an account (Lorenzo, 9 Nov), in an order that never leaves it half-gone in a bad way: any live voice room
// is closed (best effort), then the data goes (one transaction, lib/account/delete-plan.ts), then the login
// (Supabase admin API). If the data step fails, the login is kept and the student can retry; if the login step
// fails, a retry finds no data and finishes it.
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { deleteStudentData } from '@/lib/account/delete-plan';

export type DeleteDeps = {
  closeVoice: (userId: string) => Promise<void>;
  deleteData: (userId: string) => Promise<unknown>;
  deleteLogin: (userId: string) => Promise<void>;
};

export async function deleteAccount(userId: string, deps: DeleteDeps = defaultDeps): Promise<{ ok: true } | { ok: false; error: 'delete_failed' }> {
  try { await deps.closeVoice(userId); } catch (err) { console.warn('[account] could not close a voice room before deleting', err); }
  try {
    await deps.deleteData(userId);
    await deps.deleteLogin(userId);
  } catch (err) {
    console.error('[account] delete failed', err);
    return { ok: false, error: 'delete_failed' };
  }
  return { ok: true };
}

const defaultDeps: DeleteDeps = {
  closeVoice: async userId => {
    const { roomAdminFromEnv, closeVoiceRoom } = await import('@/lib/voice/room-lifecycle');
    const { voiceRoomName } = await import('@/lib/voice/capacity');
    const admin = roomAdminFromEnv();
    if (!admin) return;
    const active = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, userId), eq(sessions.status, 'active')));
    await Promise.all(active.map(s => closeVoiceRoom(admin, voiceRoomName(s.id))));
  },
  deleteData: async userId => console.log('[account] deleted', JSON.stringify(await deleteStudentData(userId))),
  deleteLogin: async userId => {
    const { createAdminSupabaseClient } = await import('@/lib/supabase/admin');
    const { error } = await createAdminSupabaseClient().auth.admin.deleteUser(userId);
    // Already gone (a retry after a timeout that did succeed): done.
    if (error && error.status !== 404 && error.code !== 'user_not_found') throw error;
  },
};
