'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clubCode, setClubCode] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'auth' | 'club' | 'select'>('auth');
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Try sign up
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) { setError(signUpError.message); return; }
    }
    setStep('club');
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
    setStep('select');
  }

  async function startCase(caseId: string) {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, clubCode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error === 'Invalid club code' ? 'Invalid club code. Contact your club president.' : 'Failed to start case. Please try again.');
      setStep('club');
      return;
    }
    const { sessionId } = await res.json();
    router.push(`/case/${sessionId}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Case Interview Practice</CardTitle>
        </CardHeader>
        <CardContent>
          {step === 'auth' && (
            <form onSubmit={handleAuth} className="space-y-3">
              <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <Button type="submit" className="w-full">Continue</Button>
            </form>
          )}
          {step === 'club' && (
            <form onSubmit={handleClubCode} className="space-y-3">
              <p className="text-sm text-neutral-600">Enter your consulting club access code.</p>
              <Input placeholder="Club code" value={clubCode} onChange={e => setClubCode(e.target.value)} required />
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <Button type="submit" className="w-full">Verify</Button>
            </form>
          )}
          {step === 'select' && (
            <div className="space-y-5">
              <section className="space-y-3">
                <h2 className="text-sm font-medium">Start a case</h2>
                <Button onClick={() => startCase('prof-001')} className="w-full" variant="outline">
                  Brew &amp; Bean — Profitability (Medium)
                </Button>
              </section>
              <section className="space-y-2">
                <h2 className="text-sm font-medium">Drills</h2>
                <p className="text-sm text-neutral-600">Short exercises on one skill at a time.</p>
                <Button onClick={() => router.push('/drills')} className="w-full">Practice drills</Button>
              </section>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
