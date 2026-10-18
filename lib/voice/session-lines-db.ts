// The database side of SessionLines: one voice_session_lines row per line.
import { db } from '@/db/client';
import { voiceSessionLines } from '@/db/schema';
import type { LineWriter } from './session-lines';

export const dbLineWriter = (sessionId: string): LineWriter => async line => {
  await db.insert(voiceSessionLines).values({ sessionId, line });
};
