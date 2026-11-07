import Link from 'next/link';
import { ChatWindow } from '@/components/chat-window';
import { CaseEndPanel } from '@/components/case-end-panel';
import { VoiceRoom } from '@/components/voice-room';
import { SiteHeader } from '@/components/site-header';
import { StartCaseButton } from '@/components/start-case-button';
import { caseHref } from '@/lib/site/case-href';
import type { ListedCase } from '@/lib/cases/listed';

// The interview screens: text, voice and a link-only case's start page.
// Their pages (app/case/[sessionId], …/voice, app/start/[caseId]) check
// access and load the session.

export function TextCaseScreen({ sessionId, active, completed, phase, casePrompt, initialMessage }: {
  sessionId: string; active: boolean; completed: boolean; phase: string; casePrompt: string | null; initialMessage: string;
}) {
  return (
    <div className="h-dvh flex flex-col">
    <SiteHeader inCase={active} />
    <main className="flex-1 min-h-0 w-full flex flex-col max-w-2xl mx-auto">
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-neutral-700">Case Interview — {phase} phase</div>
          {/* Voice is the default (Lorenzo, 6 Nov); text to voice mid-case is safe — the agent reads the turns so far. */}
          {active && (
            <Link href={caseHref(sessionId, 'voice')} className="text-xs text-neutral-500 underline">Switch to voice</Link>
          )}
        </div>
        {casePrompt && (
          <details className="mt-1">
            <summary className="text-xs text-neutral-500 cursor-pointer select-none">Case prompt</summary>
            <p className="mt-2 text-sm text-neutral-700 whitespace-pre-wrap">{casePrompt}</p>
          </details>
        )}
      </header>
      <div className="flex-1 min-h-0">
        {active
          ? <ChatWindow sessionId={sessionId} initialMessage={initialMessage} />
          // An ended case reopened: the end screen (site flow, 19 Oct). The
          // report page prepares a report not scored yet.
          : <div className="p-4"><CaseEndPanel sessionId={sessionId} report={completed ? 'ready' : undefined} /></div>}
      </div>
    </main>
    </div>
  );
}

export function VoiceCaseScreen({ sessionId, active, completed, casePrompt }: {
  sessionId: string; active: boolean; completed: boolean; casePrompt: string | null;
}) {
  return (
    <div className="h-dvh flex flex-col">
    <SiteHeader inCase={active} />
    <main className="flex-1 min-h-0 w-full flex flex-col max-w-2xl mx-auto">
      <header className="border-b px-4 py-3 text-sm font-medium text-neutral-700">Case Interview — voice</header>
      <div className="flex-1 min-h-0">
        {active
          // The room's own "Score this interview" is the report button; the end screen adds the links (site flow, 19 Oct).
          ? <VoiceRoom sessionId={sessionId} casePrompt={casePrompt} endActions={<CaseEndPanel sessionId={sessionId} />} />
          : <div className="p-4"><CaseEndPanel sessionId={sessionId} report={completed ? 'ready' : undefined} /></div>}
      </div>
    </main>
    </div>
  );
}

export function StartCaseScreen({ c, minutes }: { c: ListedCase; minutes: number }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl space-y-3 px-4 py-6">
        <h1 className="text-lg font-semibold">{c.title}</h1>
        <p className="text-sm text-neutral-600">An interviewer-led case, about {minutes} minutes. You get a scored feedback report at the end.</p>
        <StartCaseButton caseId={c.id} label="Start this case" />
      </main>
    </>
  );
}
