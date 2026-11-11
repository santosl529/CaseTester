'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { resendMessage } from '@/lib/site/auth-messages';

// "Resend the email" (Lorenzo, 11 Nov: confirm-first sign-up). Each outcome said plainly (lib/site/auth-messages.ts).
// A second click before the disabled state renders is ignored.
export function ResendVerification({ email }: { email: string }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function resend() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const res = await fetch('/api/sign-up/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setResult(resendMessage(res?.status ?? 0, res ? await res.json().catch(() => null) : null, email.trim()));
    setBusy(false);
    inFlight.current = false;
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full" onClick={resend} disabled={busy}>{busy ? 'Sending…' : 'Resend the email'}</Button>
      {result && <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>{result.text}</p>}
    </div>
  );
}
