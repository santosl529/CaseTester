'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { signOut } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Sign in, then the club code once (site flow, 19 Oct). The landing page
// decides where to start: a signed-in student with a valid code on their
// profile never sees this; one without a code starts at the club step.
export function SignInFlow({ initialStep }: { initialStep: 'auth' | 'club' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clubCode, setClubCode] = useState('');
  const [error, setError] = useState('');
  const step = initialStep;
  const router = useRouter();

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Try sign up
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) { setError(signUpError.message); return; }
      if (!data.session) { setError('Check your email to confirm your account, then sign in.'); return; }
    }
    // The landing page decides: /home when the profile already has a valid code.
    window.location.assign('/');
  }

  async function handleClubCode(e: React.FormEvent) {
    e.preventDefault();
    if (!clubCode.trim()) {
      setError('Please enter your club code.');
      return;
    }
    setError('');
    const res = await fetch('/api/club', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clubCode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error === 'Invalid club code' ? 'Invalid club code. Contact your club president.' : 'Could not check your club code. Please try again.');
      return;
    }
    router.push('/home');
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Case Interview Practice</CardTitle>
        </CardHeader>
        <CardContent>
          {step === 'auth' && (
            <form onSubmit={handleAuth} className="space-y-3">
              <Input placeholder="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
              <Input placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <Button type="submit" className="w-full">Continue</Button>
            </form>
          )}
          {step === 'club' && (
            <div className="space-y-3">
              <form onSubmit={handleClubCode} className="space-y-3">
                <p className="text-sm text-neutral-600">Enter your consulting club access code. You only need to do this once.</p>
                <Input placeholder="Club code" autoCapitalize="characters" value={clubCode} onChange={e => setClubCode(e.target.value)} required />
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <Button type="submit" className="w-full">Verify</Button>
              </form>
              <form action={signOut} className="text-center">
                <button type="submit" className="text-xs text-neutral-500 underline">Use a different account</button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
