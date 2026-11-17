// The Feedback button on phones (Matt, 17 Nov, pre-pilot audit S6): it never floats over content below md. It floats
// from md up; on phones it is in the bar's Menu, or beside Exit during timed work, on the pages that have it.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/home', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { AppNav } from '@/components/app-nav';
import { FeedbackButton, openFeedback, registerFeedbackHost } from '@/components/drills/feedback';

const classOf = (html: string, text: string) => new RegExp(`<button[^>]*class="([^"]*)"[^>]*>(?:<svg.*?</svg>)?${text}</button>`).exec(html)?.[1] ?? null;
let unregister: (() => void) | null = null;
afterEach(() => { unregister?.(); unregister = null; });

describe('the floating button', () => {
  it('is hidden below md and floats from md up', () => {
    const cls = classOf(renderToStaticMarkup(createElement(FeedbackButton)), 'Feedback');
    expect(cls).toMatch(/\bfixed\b/);
    expect(cls?.split(' ')).toContain('hidden');
    expect(cls?.split(' ')).toContain('md:inline-flex');
    expect(cls?.split(' ').filter(c => c === 'inline-flex' || c === 'flex' || c === 'block')).toEqual([]);
  });
  it('the inline variant (the interview header) is unchanged and registers nothing', () => {
    expect(renderToStaticMarkup(createElement(FeedbackButton, { placement: 'inline' }))).toMatch(/<button[^>]*>Feedback<\/button>/);
  });
});

describe('the bar on phones', () => {
  it('a page with the floating button: Feedback in Menu, phones only (the Menu is md:hidden)', () => {
    unregister = registerFeedbackHost();
    const html = renderToStaticMarkup(createElement(AppNav));
    const menu = html.slice(html.indexOf('class="md:hidden"'));
    expect(menu).toMatch(/<button[^>]*>Feedback<\/button>/);
    expect(menu.indexOf('Settings')).toBeLessThan(menu.indexOf('>Feedback<'));
    expect(menu.indexOf('>Feedback<')).toBeLessThan(menu.indexOf('Log out'));
  });
  it('timed work: Feedback beside Exit, phones only', () => {
    unregister = registerFeedbackHost();
    const html = renderToStaticMarkup(createElement(AppNav, { focus: { confirm: 'Leave?' } }));
    const cls = classOf(html, 'Feedback');
    expect(cls?.split(' ')).toContain('md:hidden');
    expect(html.indexOf('>Feedback<')).toBeLessThan(html.indexOf('Exit'));
  });
  it('a page without it (the interview, Settings): no Feedback in the bar', () => {
    expect(renderToStaticMarkup(createElement(AppNav))).not.toMatch(/>Feedback</);
    expect(renderToStaticMarkup(createElement(AppNav, { focus: { confirm: 'Leave?' } }))).not.toMatch(/>Feedback</);
  });
  it("the bar's Feedback opens the page's dialog", () => {
    const seen: string[] = [];
    const target = new EventTarget();
    vi.stubGlobal('window', Object.assign(target, { dispatchEvent: target.dispatchEvent.bind(target) }));
    target.addEventListener('casepace:feedback', () => seen.push('open'));
    openFeedback();
    expect(seen).toEqual(['open']);
    vi.unstubAllGlobals();
  });
});
