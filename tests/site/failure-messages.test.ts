// What an interview screen says for each failure (8 Nov: "make everything fail clearly and gracefully").
import { describe, it, expect } from 'vitest';
import { turnFailure, voiceStartFailure, startCaseFailure, downloadFailure, OFFLINE } from '@/lib/site/failure-messages';

describe('turnFailure (text turn not sent)', () => {
  it('each status says what happened; the typed message goes back in the box', () => {
    expect(turnFailure(0, null)).toEqual({ message: OFFLINE, restoreInput: true });
    expect(turnFailure(429, { error: 'rate_limited', retryAfterSec: 20 })).toEqual({ message: 'You’re sending messages faster than we can answer. Wait a minute, then send again.', restoreInput: true });
    expect(turnFailure(409, { error: 'A turn is already in progress for this session' })).toEqual({ message: 'Your last message is still being answered. Wait for the reply, then send again.', restoreInput: true });
    expect(turnFailure(400, { error: 'Message too long' })).toEqual({ message: 'That message is too long (4,000 characters at most). Shorten it and send again.', restoreInput: true });
    expect(turnFailure(401, { error: 'Unauthorized' })).toEqual({ message: 'You’ve been signed out. Log in again to continue this interview; it’s saved.', restoreInput: true });
    expect(turnFailure(404, { error: 'Not found' })).toEqual({ message: 'This interview couldn’t be found. Go back to your home page to start or continue one.', restoreInput: false });
    expect(turnFailure(500, { error: 'server_error' })).toEqual({ message: 'Something went wrong on our side. Send your message again.', restoreInput: true });
  });
});

describe('voiceStartFailure', () => {
  it('busy (all voice slots in use) vs rate-limited are different messages', () => {
    expect(voiceStartFailure(429, { error: 'busy' })).toMatch(/^Voice is busy/);
    expect(voiceStartFailure(429, { error: 'rate_limited', retryAfterSec: 1200 })).toBe('Voice has been started too many times in the last hour. Try again in 20 minutes, or continue in text.');
  });
  it('the rest', () => {
    expect(voiceStartFailure(0, null)).toBe(OFFLINE);
    expect(voiceStartFailure(409, {})).toBe('This interview has ended, so voice can’t start. Go back to your home page to start another.');
    expect(voiceStartFailure(503, {})).toBe('Voice isn’t available right now. Continue this interview in text.');
    expect(voiceStartFailure(401, {})).toBe('You’ve been signed out. Log in again to continue this interview; it’s saved.');
    expect(voiceStartFailure(500, {})).toBe('Voice couldn’t start. Press Start to try again, or continue in text.');
  });
});

describe('startCaseFailure', () => {
  it('offline, signed out, server error (limits are lib/site/limit-message.ts)', () => {
    expect(startCaseFailure(0, null)).toBe(OFFLINE);
    expect(startCaseFailure(401, {})).toBe('You’ve been signed out. Log in again, then start the case.');
    expect(startCaseFailure(500, {})).toBe('The case couldn’t start. Please try again in a moment.');
    expect(startCaseFailure(429, { error: 'session_limit', reason: 'busy', limit: 5 })).toBe('All interview slots are in use right now. Please try again in a few minutes.');
  });
});

describe('downloadFailure (report PDF)', () => {
  it('rate-limited, missing, signed out, other', () => {
    expect(downloadFailure(429, { error: 'rate_limited', retryAfterSec: 600 })).toBe('You’ve downloaded this report a lot in the last hour. Try again in 10 minutes.');
    expect(downloadFailure(404, {})).toBe('This report isn’t available to download.');
    expect(downloadFailure(401, {})).toBe('You’ve been signed out. Log in again to download your report.');
    expect(downloadFailure(0, null)).toBe(OFFLINE);
    expect(downloadFailure(500, null)).toBe('The PDF couldn’t be made just now. Please try again in a minute.');
  });
});
