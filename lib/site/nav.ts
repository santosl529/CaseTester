// The app's one navigation bar (Matt, 13 Nov 2026): six main areas, in this
// order, and which one a page belongs to. Pure, so the active-link rules are
// tested without a browser (tests/site/nav.test.ts).

export type NavSection = 'today' | 'plan' | 'learn' | 'drills' | 'cases' | 'progress';

export const NAV_LINKS: { id: NavSection; label: string; href: string }[] = [
  { id: 'today', label: 'Today', href: '/drills' },
  { id: 'plan', label: 'Plan', href: '/drills/plan' },
  { id: 'learn', label: 'Learn', href: '/drills/learn' },
  { id: 'drills', label: 'Drills', href: '/drills/browse' },
  { id: 'cases', label: 'Cases', href: '/home' },
  { id: 'progress', label: 'Progress', href: '/drills/progress' },
];

export const HOME_HREF = '/drills';
export const SETTINGS_HREF = '/drills/settings';

export const sectionHref = (id: NavSection) => NAV_LINKS.find(l => l.id === id)!.href;

// The area a path belongs to: 'settings' for the account menu's page, null for
// pages outside the six (the reviewer tools). A drill set or its results is
// Drills here; its page says Today instead when the set came from today's
// workout, which the path can't tell.
export function navSectionFor(path: string): NavSection | 'settings' | null {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const under = (base: string) => p === base || p.startsWith(`${base}/`);
  if (under('/home') || under('/case') || under('/start')) return 'cases';
  if (under('/drills/settings')) return 'settings';
  if (under('/drills/plan')) return 'plan';
  if (under('/drills/learn')) return 'learn';
  if (under('/drills/browse') || under('/drills/sets')) return 'drills';
  if (under('/drills/progress') || under('/drills/profile')) return 'progress';
  if (under('/drills/review') || under('/drills/reports')) return null;
  // The training home and what it leads into: setting up, the questionnaire, the diagnostic.
  if (under('/drills')) return 'today';
  return null;
}
