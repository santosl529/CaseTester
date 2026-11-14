// Voice consent (Lorenzo, 14 Nov: "add the box"; Matt's Voice and Biometric Data Policy, 12 Nov): written consent,
// given by checking a box and confirming, before the first voice interview; a short notice before every later one.
// The record (time + the policy version agreed to) lives on the student's profile, and the token route refuses to
// start voice without it. A newer policy version asks again.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/db/client', () => ({ db: {} }));

import { VOICE_CONSENT_VERSION, hasVoiceConsent, parseVoiceConsent } from '@/lib/voice/consent';
import { voiceStartFailure } from '@/lib/site/failure-messages';
import { VoiceConsentGate } from '@/components/voice-consent';

describe('hasVoiceConsent', () => {
  const at = new Date('2026-11-14T12:00:00Z');
  it('a record for the current policy version counts', () => {
    expect(hasVoiceConsent({ voiceConsentAt: at, voiceConsentVersion: VOICE_CONSENT_VERSION })).toBe(true);
  });
  it('no profile, no record, or an older version: ask (again)', () => {
    expect(hasVoiceConsent(null)).toBe(false);
    expect(hasVoiceConsent(undefined)).toBe(false);
    expect(hasVoiceConsent({ voiceConsentAt: null, voiceConsentVersion: null })).toBe(false);
    expect(hasVoiceConsent({ voiceConsentAt: at, voiceConsentVersion: '2026-01-01' })).toBe(false);
  });
});

describe('parseVoiceConsent (the POST body)', () => {
  it('the box checked, for the version the page showed', () => {
    expect(parseVoiceConsent({ agree: true, version: VOICE_CONSENT_VERSION })).toEqual({ ok: true, version: VOICE_CONSENT_VERSION });
  });
  it('anything else is not consent', () => {
    expect(parseVoiceConsent({ agree: false, version: VOICE_CONSENT_VERSION })).toEqual({ ok: false, error: 'consent_required' });
    expect(parseVoiceConsent({ agree: 'yes', version: VOICE_CONSENT_VERSION })).toEqual({ ok: false, error: 'consent_required' });
    expect(parseVoiceConsent(null)).toEqual({ ok: false, error: 'consent_required' });
  });
  it('a page showing an older policy: stale (reload to see the current one)', () => {
    expect(parseVoiceConsent({ agree: true, version: '2026-01-01' })).toEqual({ ok: false, error: 'stale_policy' });
  });
});

describe('the token route refusing without consent', () => {
  it('says what to do', () => {
    expect(voiceStartFailure(403, { error: 'consent_required' })).toBe('Check the consent box and press “I agree, start voice” to start, or continue in text.');
  });
});

describe('VoiceConsentGate', () => {
  const render = (consented: boolean) => renderToStaticMarkup(createElement(VoiceConsentGate, {
    consented, textHref: '/case/s1', busy: false, onStart: () => {}, onConsent: async () => true,
  }));
  it('first time: Matt\'s consent text, the box, and "I agree" disabled until it is checked', () => {
    const html = render(false);
    expect(html).toContain('Voice interview consent');
    expect(html).toContain('We don&#x27;t create voiceprints or use your voice to identify you.');
    expect(html).toContain('Your audio is destroyed within 30 days of each session');
    expect(html).toContain('href="/voice-policy"');
    expect(html).toMatch(/type="checkbox"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>I agree, start voice<\/button>/);
    expect(html).toContain('Use text instead');
  });
  it('later sessions: the short notice and Start voice', () => {
    const html = render(true);
    expect(html).toContain('This session will capture your voice to transcribe your answers.');
    expect(html).toMatch(/<button[^>]*>Start voice<\/button>/);
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('Use text instead');
  });
});
