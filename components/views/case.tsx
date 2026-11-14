import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AppPage } from '@/components/brand/page';
import { ChatWindow } from '@/components/chat-window';
import { CaseEndPanel } from '@/components/case-end-panel';
import { VoiceRoom } from '@/components/voice-room';
import { AppNav, FocusScope } from '@/components/app-nav';
import { StartCaseButton } from '@/components/start-case-button';
import { caseHref } from '@/lib/site/case-href';
import type { ListedCase } from '@/lib/cases/listed';

// The interview screens: text, voice and a link-only case's start page.
// Their pages (app/case/[sessionId], …/voice, app/start/[caseId]) check
// access and load the session. While an interview runs the bar is in focus
// mode (the logo and Exit); the end panel brings the full bar back.

// Leaving stops the interview, so Exit asks first.
const LEAVE_CASE = 'Leave this page? If the interview is still going, it stops here and won’t be scored.';

export function TextCaseScreen({ sessionId, active, completed, phase, casePrompt, initialMessage }: {
  sessionId: string; active: boolean; completed: boolean; phase: string; casePrompt: string | null; initialMessage: string;
}) {
  return (
    <FocusScope>
    <div className="h-dvh flex flex-col">
    <AppNav focus={active ? { confirm: LEAVE_CASE } : undefined} />
    <main className="flex-1 min-h-0 w-full flex flex-col max-w-3xl mx-auto">
      <header className="border-b border-ink/12 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="t-small font-semibold">Case interview <span className="font-normal text-ink/70">— {phase} phase</span></div>
          {/* Voice is the default (Lorenzo, 6 Nov); text to voice mid-case is safe — the agent reads the turns so far. */}
          {active && (
            <Link href={caseHref(sessionId, 'voice')} className="link t-small whitespace-nowrap">Switch to voice</Link>
          )}
        </div>
        {casePrompt && <CasePrompt text={casePrompt} />}
      </header>
      <div className="flex-1 min-h-0">
        {active
          ? <ChatWindow sessionId={sessionId} initialMessage={initialMessage} />
          // An ended case reopened: the end screen (site flow, 19 Oct). The
          // report page prepares a report not scored yet.
          : <div className="p-6"><CaseEndPanel sessionId={sessionId} report={completed ? 'ready' : undefined} /></div>}
      </div>
    </main>
    </div>
    </FocusScope>
  );
}

// The case brief, kept one click away so it can be re-read mid-case.
function CasePrompt({ text }: { text: string }) {
  return (
    <details className="group mt-1.5">
      <summary className="t-label inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-ink/70 select-none hover:text-cobalt [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-3.5 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />Case prompt
      </summary>
      <p className="t-small mt-2 max-w-[65ch] whitespace-pre-wrap text-ink/85">{text}</p>
    </details>
  );
}

export function VoiceCaseScreen({ sessionId, active, completed, casePrompt }: {
  sessionId: string; active: boolean; completed: boolean; casePrompt: string | null;
}) {
  return (
    <FocusScope>
    <div className="h-dvh flex flex-col">
    <AppNav focus={active ? { confirm: LEAVE_CASE } : undefined} />
    <main className="flex-1 min-h-0 w-full flex flex-col max-w-3xl mx-auto">
      <header className="t-small border-b border-ink/12 px-6 py-3 font-semibold">Case interview <span className="font-normal text-ink/70">— voice</span></header>
      <div className="flex-1 min-h-0">
        {active
          // The room's own "Score this interview" is the report button; the end screen adds the links (site flow, 19 Oct).
          ? <VoiceRoom sessionId={sessionId} casePrompt={casePrompt} endActions={<CaseEndPanel sessionId={sessionId} />} />
          : <div className="p-6"><CaseEndPanel sessionId={sessionId} report={completed ? 'ready' : undefined} /></div>}
      </div>
    </main>
    </div>
    </FocusScope>
  );
}

export function StartCaseScreen({ c, minutes }: { c: ListedCase; minutes: number }) {
  return (
    <>
      <AppNav />
      <AppPage width="narrow" className="space-y-6">
        <header className="space-y-3">
          <h1 className="t-title text-balance">{c.title}</h1>
          <p className="t-body text-ink/70">An interviewer-led case, about {minutes} minutes. You get a scored feedback report at the end.</p>
        </header>
        <div className="max-w-sm"><StartCaseButton caseId={c.id} label="Start this case" /></div>
      </AppPage>
    </>
  );
}
