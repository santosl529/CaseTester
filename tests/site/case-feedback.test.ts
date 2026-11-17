// The Feedback button on the case side (Matt, 17 Nov, pre-pilot audit S3): Cases, the report and Account float it like
// the training pages; the interview puts it in its header, so on a phone it never covers the text box or the messages.
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/home', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { HomeView } from '@/components/home-view';
import { NoReportScreen, UnscoredReportScreen } from '@/components/views/report';
import { TextCaseScreen } from '@/components/views/case';

const SID = '51111111-1111-4111-8111-111111111111';
// The floating button: fixed in the corner, named "Feedback".
const floating = (html: string) => /<button[^>]*aria-label="Feedback"[^>]*class="[^"]*\bfixed\b/.test(html);
const inline = (html: string) => /<button[^>]*>Feedback<\/button>/.test(html);

describe('Feedback on the case side (S3)', () => {
  it('Cases: the floating button', () => {
    expect(floating(renderToStaticMarkup(createElement(HomeView, { cases: [], past: [], left: null })))).toBe(true);
  });
  it('the report, in each of its states: the floating button', () => {
    expect(floating(renderToStaticMarkup(createElement(UnscoredReportScreen, { sessionId: SID, caseTitle: 'Larkspur Air' })))).toBe(true);
    expect(floating(renderToStaticMarkup(createElement(NoReportScreen, { caseTitle: 'Larkspur Air', message: 'x', link: { href: '/home', label: 'Cases' } })))).toBe(true);
    expect(fs.readFileSync('components/views/report.tsx', 'utf8').match(/<FeedbackButton \/>/g)?.length).toBe(3);
  });
  it('the text interview: in the header, never floating', () => {
    const html = renderToStaticMarkup(createElement(TextCaseScreen, { sessionId: SID, active: true, completed: false, casePrompt: 'A prompt', initialMessage: 'Welcome.' }));
    expect(inline(html)).toBe(true);
    expect(floating(html)).toBe(false);
    expect(html.indexOf('>Feedback<')).toBeLessThan(html.indexOf('Type your response'));
  });
  it('the voice interview and Account (server or SDK pages): placed as above', () => {
    const voice = fs.readFileSync('components/views/case.tsx', 'utf8');
    expect(voice.match(/<FeedbackButton placement="inline" \/>/g)?.length).toBe(2);
    expect(voice).not.toMatch(/<FeedbackButton \/>/);
    expect(fs.readFileSync('app/account/page.tsx', 'utf8')).toMatch(/<FeedbackButton \/>/);
  });
});
