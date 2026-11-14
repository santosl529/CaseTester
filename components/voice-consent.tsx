'use client';
import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { VOICE_POLICY_HREF } from '@/components/site/content';

// What the voice screen shows before Start (Lorenzo, 14 Nov: "add the box"; wording Matt's, from his Voice and
// Biometric Data Policy). First time: the written consent — the box must be checked before "I agree, start voice"
// does anything, and agreeing records the consent (POST /api/voice/consent) before voice starts. Later sessions:
// the one-line notice. Either way "Use text instead" continues the same interview in text.
export function VoiceConsentGate({ consented, textHref, busy, onStart, onConsent }: {
  consented: boolean;
  textHref: string;
  busy: boolean;
  onStart: () => void;
  // Records consent; false when it couldn't be recorded (the caller shows why).
  onConsent: () => Promise<boolean>;
}) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const boxId = useId();

  if (consented) {
    return (
      <div className="space-y-3">
        <p className="t-small">This session will capture your voice to transcribe your answers.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onStart} disabled={busy}>Start voice</Button>
          <Link href={textHref} className="link t-small">Use text instead</Link>
        </div>
      </div>
    );
  }

  async function agree() {
    if (!checked || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      if (await onConsent()) onStart();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby={`${boxId}-h`} className="space-y-3 rounded-panel border border-ink/12 bg-white p-5">
      <h2 id={`${boxId}-h`} className="t-heading font-semibold">Voice interview consent</h2>
      <p className="t-small">
        To run a voice interview, CasePace captures your spoken audio and converts it to text so the interviewer can respond and your answers can be graded. We don&apos;t create voiceprints or use your voice to identify you. Your audio is destroyed within 30 days of each session, as described in our{' '}
        <Link href={VOICE_POLICY_HREF} target="_blank" className="link">Voice and Biometric Data Policy</Link>.
      </p>
      <p className="t-small">You can take any case in text instead, and you can withdraw this consent at any time.</p>
      <label htmlFor={boxId} className="t-small flex items-start gap-2">
        <input id={boxId} type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-1 size-4 shrink-0 accent-cobalt" />
        <span>I have read the Voice and Biometric Data Policy and I consent to CasePace capturing and processing my voice as described.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={agree} disabled={!checked || saving || busy}>I agree, start voice</Button>
        <Link href={textHref} className={buttonVariants({ variant: 'outline', size: 'lg' })}>Use text instead</Link>
      </div>
    </section>
  );
}
