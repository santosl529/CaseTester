'use client';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, X } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { HOME_HREF, NAV_LINKS, SETTINGS_HREF, navSectionFor, sectionHref, type NavSection } from '@/lib/site/nav';

// The app's one navigation bar (Matt, 13 Nov 2026), on every signed-in page:
// CasePace · Today · Plan · Learn · Drills · Cases · Progress · Account. The
// page's area is underlined (lib/site/nav.ts says which); below md it folds
// into a Menu panel. During timed work (an interview, a drill set) it is the
// logo and Exit only, and leaving asks first.

type Current = NavSection | 'settings' | null;

// Focus mode ends without a reload when a case ends on its page: the end
// panel calls useEndFocus() and the full bar comes back.
const FocusEnded = createContext<{ ended: boolean; end: () => void } | null>(null);

export function FocusScope({ children }: { children: React.ReactNode }) {
  const [ended, setEnded] = useState(false);
  const end = useCallback(() => setEnded(true), []);
  return <FocusEnded.Provider value={{ ended, end }}>{children}</FocusEnded.Provider>;
}

export function useEndFocus() {
  const end = useContext(FocusEnded)?.end;
  useEffect(() => { end?.(); }, [end]);
}

// The path the bar reads: the browser's, or, in the UI previews
// (app/dev/ui-preview), the page being previewed.
const PreviewPath = createContext<string | null>(null);

export function NavPathOverride({ path, children }: { path: string | null; children: React.ReactNode }) {
  return <PreviewPath.Provider value={path}>{children}</PreviewPath.Provider>;
}

function useNavPath() {
  const real = usePathname() ?? '';
  return useContext(PreviewPath) ?? real;
}

const linkClass = 't-small inline-flex items-center whitespace-nowrap py-1 text-ink/70 underline-offset-[7px] transition-colors hover:text-ink motion-reduce:transition-none data-[active=true]:text-ink data-[active=true]:underline data-[active=true]:decoration-cobalt data-[active=true]:decoration-2';

// aria-current: "page" on the area's own page, "true" on a page inside it.
const currentAttr = (on: boolean, exact: boolean) => (on ? (exact ? 'page' : 'true') : undefined);

export function AppNav({ section, focus }: {
  // The page's area, when the path can't tell (a set from today's workout is Today).
  section?: Current;
  // Timed work: the logo and Exit only; leaving shows `confirm` first.
  focus?: { confirm: string };
}) {
  const path = useNavPath();
  const current = section !== undefined ? section : navSectionFor(path);
  const ended = useContext(FocusEnded)?.ended ?? false;
  const inFocus = Boolean(focus) && !ended;

  const confirmLeave = (e: React.MouseEvent) => {
    if (inFocus && focus && !window.confirm(focus.confirm)) e.preventDefault();
  };

  return (
    <header className="sticky top-0 z-40 h-(--hdr) border-b border-ink/14 bg-paper/88 backdrop-blur-[10px]">
      <nav aria-label="Main" className="mx-auto flex h-full w-full max-w-[1240px] items-center gap-6 px-6 lg:px-12">
        <Link href={HOME_HREF} onClick={confirmLeave} className="t-card mr-auto font-semibold tracking-[-0.02em] text-ink">CasePace</Link>
        {inFocus ? (
          <Link href={current && current !== 'settings' ? sectionHref(current) : HOME_HREF} onClick={confirmLeave}
            className="t-small rounded-full border border-ink/20 bg-white px-4 py-1.5 font-medium text-ink transition-colors hover:border-ink/40 motion-reduce:transition-none">
            Exit
          </Link>
        ) : (
          <>
            <ul className="hidden items-center gap-6 md:flex">
              {NAV_LINKS.map(l => (
                <li key={l.id}>
                  <Link href={l.href} data-active={current === l.id} aria-current={currentAttr(current === l.id, path === l.href)} className={linkClass}>{l.label}</Link>
                </li>
              ))}
            </ul>
            <AccountMenu settingsActive={current === 'settings'} />
            <MobileMenu current={current} path={path} />
          </>
        )}
      </nav>
    </header>
  );
}

// Settings and Sign out, behind "Account" (the menu button pattern: arrows,
// Home and End move, Escape closes and returns focus, Tab or a click outside closes).
function AccountMenu({ settingsActive }: { settingsActive: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const focusItem = (i: number) => { const all = items(); all[(i + all.length) % all.length]?.focus(); };

  // The item to focus once the menu is shown.
  const focusOnOpen = useRef<number | null>(null);
  const openAt = (i: number) => { focusOnOpen.current = i; setOpen(true); };
  const close = (refocus: boolean) => { setOpen(false); if (refocus) button.current?.focus(); };
  useEffect(() => {
    if (open && focusOnOpen.current !== null) { focusItem(focusOnOpen.current); focusOnOpen.current = null; }
  });

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAt(0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); openAt(-1); }
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    const at = items().indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(at + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(at - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
    else if (e.key === 'End') { e.preventDefault(); focusItem(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const item = 't-small block w-full px-4 py-2 text-left text-ink outline-none hover:bg-paper focus-visible:bg-sky/60 data-[active=true]:font-semibold';
  return (
    <div ref={wrap} className="relative hidden md:block">
      <button ref={button} type="button" id={`${id}-button`} aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-menu`}
        onClick={() => (open ? close(false) : openAt(0))} onKeyDown={onButtonKey} data-active={settingsActive}
        className={`${linkClass} cursor-pointer gap-1`}>
        Account<ChevronDown aria-hidden="true" className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={`${id}-menu`} role="menu" aria-labelledby={`${id}-button`} hidden={!open} onKeyDown={onMenuKey}
        className="absolute right-0 top-full mt-2 min-w-44 overflow-hidden rounded-window border border-ink/12 bg-white py-1 shadow-panel">
        <Link href={SETTINGS_HREF} role="menuitem" tabIndex={-1} data-active={settingsActive} aria-current={settingsActive ? 'page' : undefined}
          onClick={() => setOpen(false)} className={item}>Settings</Link>
        <form action={signOut} role="none">
          <button type="submit" role="menuitem" tabIndex={-1} className={`${item} cursor-pointer`}>Sign out</button>
        </form>
      </div>
    </div>
  );
}

// Below md: "Menu" opens a full-width panel with the six links, then Settings
// and Sign out. Escape, Close, a link or a tap outside closes it.
function MobileMenu({ current, path }: { current: Current; path: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Escape and a tap outside close it. (A listener, not a backdrop: the bar's
  // blur makes it the box a fixed backdrop would be sized to.)
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', outside); };
  }, [open]);

  const row = 't-body flex items-center border-l-2 border-transparent px-6 py-3 text-ink/75 hover:bg-white/60 data-[active=true]:border-cobalt data-[active=true]:bg-white data-[active=true]:font-semibold data-[active=true]:text-ink';
  return (
    <div ref={wrap} className="md:hidden">
      <button ref={button} type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(o => !o)}
        className="t-small inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-ink/20 bg-white px-3.5 py-1.5 font-medium text-ink">
        {open ? <X aria-hidden="true" className="size-4" /> : <Menu aria-hidden="true" className="size-4" />}
        {open ? 'Close' : 'Menu'}
      </button>
      <div id={`${id}-panel`} hidden={!open} className="absolute inset-x-0 top-full border-b border-ink/14 bg-paper shadow-panel">
        <ul className="py-2">
          {NAV_LINKS.map(l => (
            <li key={l.id}>
              <Link href={l.href} data-active={current === l.id} aria-current={currentAttr(current === l.id, path === l.href)}
                onClick={() => setOpen(false)} className={row}>{l.label}</Link>
            </li>
          ))}
        </ul>
        <ul className="border-t border-ink/12 py-2">
          <li>
            <Link href={SETTINGS_HREF} data-active={current === 'settings'} aria-current={current === 'settings' ? 'page' : undefined}
              onClick={() => setOpen(false)} className={row}>Settings</Link>
          </li>
          <li>
            <form action={signOut}>
              <button type="submit" className={`${row} w-full cursor-pointer text-left`}>Sign out</button>
            </form>
          </li>
        </ul>
      </div>
    </div>
  );
}

// The drills layout's bar. A drill set's pages draw their own (they know whether
// the set is running and whether it came from today's workout), so this one
// steps aside there.
export function DrillsLayoutNav() {
  const path = useNavPath();
  return path.startsWith('/drills/sets/') ? null : <AppNav />;
}
