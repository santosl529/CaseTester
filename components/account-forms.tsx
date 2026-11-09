'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { clubChangeErrorMessage, deleteErrorMessage } from '@/lib/site/auth-messages';

// /account's forms (Lorenzo, 9 Nov). Each disables while it runs and ignores a second click before that renders.
function useGuard() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function run(fn: () => Promise<boolean>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    // `true` = leaving the page: stay disabled until it changes.
    const leaving = await fn().catch(() => false);
    if (!leaving) { setBusy(false); inFlight.current = false; }
  }
  return { busy, run };
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, data: null };
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export function ChangeClubForm() {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const { busy, run } = useGuard();
  const router = useRouter();

  return (
    <form
      className="flex max-w-md flex-col gap-2 sm:flex-row"
      onSubmit={e => {
        e.preventDefault();
        void run(async () => {
          setMessage(null);
          const { ok, data } = await post('/api/account/club', { clubCode: code });
          if (ok) {
            setMessage({ ok: true, text: data?.changed ? `Done: your club is now ${String(data.club)}.` : 'That’s already your club.' });
            setCode('');
            router.refresh();
          } else {
            setMessage({ ok: false, text: clubChangeErrorMessage(data as never) });
          }
          return false;
        });
      }}
    >
      <Input placeholder="New club code" autoCapitalize="characters" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required />
      <Button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Change club'}</Button>
      {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm sm:basis-full ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
    </form>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const { busy, run } = useGuard();
  const matches = typed.trim().toLowerCase() === email.toLowerCase() && email !== '';

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-neutral-600">Permanently delete your account and everything in it.</p>
        <Button type="button" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => setOpen(true)}>Delete my account…</Button>
      </div>
    );
  }
  return (
    <form
      className="max-w-md space-y-3 rounded-md border border-red-200 bg-red-50/50 p-4"
      onSubmit={e => {
        e.preventDefault();
        if (!matches) return;
        void run(async () => {
          setError('');
          const { ok, data } = await post('/api/account/delete', { confirmEmail: typed });
          if (ok) { window.location.assign('/sign-in?deleted=1'); return true; }
          setError(deleteErrorMessage(data as never));
          return false;
        });
      }}
    >
      <p className="text-sm">
        This deletes your login, your interviews, transcripts and reports, and your drills progress. It can’t be undone.
      </p>
      <label className="block space-y-1 text-sm">
        <span>Type your email (<strong>{email}</strong>) to confirm:</span>
        <Input type="email" autoComplete="off" value={typed} onChange={e => setTyped(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!matches || busy} className="bg-red-600 text-white hover:bg-red-700">{busy ? 'Deleting…' : 'Delete my account'}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setTyped(''); setError(''); }}>Cancel</Button>
      </div>
    </form>
  );
}
