// The interview so far, rebuilt from the database when its page loads (Matt, 17 Nov, pre-pilot audit M2: a refresh, or
// reopening a closed tab, showed only the opening prompt; the exhibits were gone though the interviewer still referred
// to them). Pure: the page reads the stored turns and the exhibits shown, and this puts each exhibit after the
// interviewer reply that showed it. Only what the student already saw: stored turns are the lines as shown, and an
// exhibit appears only once it was shown.
import { exhibitDisplay, type ExhibitDisplay } from '@/lib/orchestrator/turn-types';

export type HistoryMessage = { role: 'interviewer' | 'candidate'; text: string; exhibit?: ExhibitDisplay };
type Turn = { turnIndex: number; role: string; text: string; timestampMs: number };
type Shown = { exhibitId: string; shownAtMs: number };
type CaseExhibit = { id: string; title: string; chartType: string; data: unknown; notes?: string | null; columnLabels?: Record<string, string> };

export { exhibitDisplay };

export function buildCaseHistory(turns: Turn[], shown: Shown[], exhibits: CaseExhibit[]): HistoryMessage[] {
  const ordered = [...turns].sort((a, b) => a.turnIndex - b.turnIndex);
  const messages: (HistoryMessage & { turnIndex: number; at: number })[] = ordered.map(t => ({
    role: t.role === 'candidate' ? 'candidate' : 'interviewer', text: t.text, turnIndex: t.turnIndex, at: t.timestampMs,
  }));
  const seen = new Set<string>();
  for (const s of [...shown].sort((a, b) => a.shownAtMs - b.shownAtMs)) {
    const ex = exhibits.find(e => e.id === s.exhibitId);
    if (!ex || seen.has(ex.id)) continue;
    seen.add(ex.id);
    // A text turn records the exhibit at its candidate turn's time, and the interviewer reply right after shows it.
    // The voice room records it when it rendered: the latest interviewer reply by then.
    const asked = messages.find(m => m.role === 'candidate' && m.at === s.shownAtMs);
    const target = (asked && messages.find(m => m.role === 'interviewer' && m.turnIndex > asked.turnIndex))
      ?? [...messages].reverse().find(m => m.role === 'interviewer' && m.at <= s.shownAtMs)
      ?? messages.find(m => m.role === 'interviewer');
    if (!target) continue;
    if (!target.exhibit) { target.exhibit = exhibitDisplay(ex); continue; }
    // A second exhibit on the same reply: its own exhibit-only message right after.
    messages.splice(messages.indexOf(target) + 1, 0, { role: 'interviewer', text: '', exhibit: exhibitDisplay(ex), turnIndex: target.turnIndex, at: target.at });
  }
  return messages.map(({ role, text, exhibit }) => (exhibit ? { role, text, exhibit } : { role, text }));
}
