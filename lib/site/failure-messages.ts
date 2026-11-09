// What the interview screens say when something fails (8 Nov: "make everything fail clearly and gracefully"):
// what happened, and what to do next. Inputs are a status (0 = no answer at all) and the JSON body, if any.
import { VOICE_BUSY_MESSAGE } from '@/lib/voice/capacity';
import { MAX_TURN_CHARS } from '@/lib/turn-limits';
import { limitMessage } from '@/lib/site/limit-message';

type Body = Record<string, unknown> | null;
export const OFFLINE = 'We couldn’t reach the server. Check your connection and try again.';
const SIGNED_OUT = (what: string) => `You’ve been signed out. Log in again ${what}`;

function wait(seconds: unknown): string {
  const s = typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : 0;
  if (!s) return 'a few minutes';
  const m = Math.ceil(s / 60);
  return m <= 1 ? 'a minute' : `${m} minutes`;
}

// A text turn that didn't go through. `restoreInput`: put the typed message back in the box to send again.
export function turnFailure(status: number, data: Body): { message: string; restoreInput: boolean } {
  if (status === 0) return { message: OFFLINE, restoreInput: true };
  if (status === 429) return { message: `You’re sending messages faster than we can answer. Wait ${wait(data?.retryAfterSec)}, then send again.`, restoreInput: true };
  if (status === 409) return { message: 'Your last message is still being answered. Wait for the reply, then send again.', restoreInput: true };
  if (status === 400 && data?.error === 'Message too long') return { message: `That message is too long (${MAX_TURN_CHARS.toLocaleString('en-US')} characters at most). Shorten it and send again.`, restoreInput: true };
  if (status === 401) return { message: SIGNED_OUT('to continue this interview; it’s saved.'), restoreInput: true };
  if (status === 404) return { message: 'This interview couldn’t be found. Go back to your home page to start or continue one.', restoreInput: false };
  return { message: 'Something went wrong on our side. Send your message again.', restoreInput: true };
}

export function voiceStartFailure(status: number, data: Body): string {
  if (status === 0) return OFFLINE;
  if (status === 429 && data?.error === 'rate_limited') return `Voice has been started too many times in the last hour. Try again in ${wait(data.retryAfterSec)}, or continue in text.`;
  if (status === 429) return VOICE_BUSY_MESSAGE;
  if (status === 409) return 'This interview has ended, so voice can’t start. Go back to your home page to start another.';
  if (status === 503) return 'Voice isn’t available right now. Continue this interview in text.';
  if (status === 401) return SIGNED_OUT('to continue this interview; it’s saved.');
  return 'Voice couldn’t start. Press Start to try again, or continue in text.';
}

export function startCaseFailure(status: number, data: Body): string {
  if (status === 0) return OFFLINE;
  if (data?.error === 'session_limit') return limitMessage(data as Parameters<typeof limitMessage>[0]);
  if (status === 401) return 'You’ve been signed out. Log in again, then start the case.';
  if (data?.error === 'Invalid club code') return 'Your club code is no longer valid. Enter a new one on your Account page.';
  return 'The case couldn’t start. Please try again in a moment.';
}

export function downloadFailure(status: number, data: Body): string {
  if (status === 0) return OFFLINE;
  if (status === 429) return `You’ve downloaded this report a lot in the last hour. Try again in ${wait(data?.retryAfterSec)}.`;
  if (status === 404) return 'This report isn’t available to download.';
  if (status === 401) return SIGNED_OUT('to download your report.');
  return 'The PDF couldn’t be made just now. Please try again in a minute.';
}
