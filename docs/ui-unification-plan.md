# UI unification plan: the homepage's design system across the app

Branch `design/unify-ui`, cut from origin/main 696531e9 on 7 Nov 2026. Written as the audit before any change; approved by Matt on 7 Nov with the decisions below (§7).

Source of truth: the homepage (`/`) and How it works (`/how-it-works`) as they are on main, including the accuracy edits logged in `docs/site-launch/copy-changes.md`. No copy on those two pages changes on this branch.

## 1. The homepage's design system today

| Piece | Where | What it holds | Reusable as is? |
|---|---|---|---|
| Palette | `app/(site)/palette.css` | `--ink #0E1424`, `--cobalt #2D4BD8`, `--sky #DCE5FF`, `--paper #F7F7F4`, `--mastery #1F9D63`, `--white`, as `:root` variables, plus a Cobalt focus ring (a white inner ring on Ink). | The values, yes. The file is only imported by the `(site)` layout, so the app never loads these variables. |
| Type scale | `components/site/type.css` | Six roles: `t-display`, `t-section`, `t-card`, `t-body`, `t-small`, `t-label`, with larger sizes from 1024px. The header height is `--hdr`. | Yes, but it is scoped to `[data-exhibition]` and has to be unscoped. |
| Buttons and links | `type.css` | `btn-primary`: a Cobalt pill, 48px (36px `compact`), Ink on hover. `btn-secondary`: an outlined Ink pill, 36px. `link` and `link-quiet`. 150ms colour transitions, removed under reduced motion. | Yes, after the same unscoping. |
| Surfaces | `components/site/exhibition.module.css` (1,539 lines) | `.panel`: white, a 1px Ink-12% border, 14px radius and a soft long shadow. `.quiet`: the same with a flat shadow. `.caps`, `.figures` (tabular numbers). | The panel, yes. Most of the rest is homepage choreography (scroll scrubs, slides, loop previews) that the app doesn't need. |
| Window frame | `BrowserFrame` in `components/site/screens.tsx`; `ExhibitPanel` in `voice-call.tsx` | A 28px Paper title bar with three dots and the product name; a 10px radius. | The look, yes. The component itself carries homepage-only crop logic, so the app gets a plain version. |
| Progress | `.loopTrack` / `.loopFill` (2px line, green dots for done), `.meter` (a 120×6 bar filled in Mastery green, track `#E3E2DC`) | | The look, yes. |
| Motion | `exhibition.module.css`, `reveal.tsx`, `motion.ts` | Easing `cubic-bezier(0.16, 1, 0.3, 1)` at 450–600ms for state changes; `cubic-bezier(0.22, 1, 0.36, 1)` at 200–300ms for small lifts; reveals at 750–900ms. Transforms and opacity only. Reduced motion always shows the final state. | The easings and durations, yes. Scroll reveals stay on the homepage; the app gets state-change motion only. |
| Fonts | `app/layout.tsx` (Geist and Geist Mono, sitewide); `components/site/fonts.ts` (JetBrains Mono) | Headlines and body text are Geist; `.display` is Geist too. JetBrains Mono is used only on the Under the hood slide. | Yes. The app already uses Geist, so no font change is needed. |
| Greys | Inline | Ink at an alpha: 70% for secondary text (`MUTED`), 65% for labels, 12–15% for borders, 8–10% for rules. Two hex greys: `#E3E2DC` (meter track) and `#C4C2B9` (preview rings). | Yes, as tokens. |

There is no shared component library behind the homepage: its pieces are Tailwind classes against the CSS variables (`bg-(--cobalt)`), plus the module classes above.

Found on the way, for later cleanup: the `(site)` layout loads Bodoni Moda as `--font-display`, but nothing uses it. Removing it would change nothing on screen.

## 2. The rest of the app today

There are two styling worlds, and neither uses the homepage palette.

- **shadcn tokens (drills and lessons).** `app/globals.css` defines shadcn's default greyscale (`--primary` near-black, `--muted`, `--border`, a 10px `--radius`), plus a dark theme that no page uses. The drills screens use the semantic classes (`text-muted-foreground`, `bg-primary`, `border-destructive`) and the four shadcn components in `components/ui` (button, card, badge, input).
- **Raw Tailwind greys (the case, report, voice, home and sign-in screens).** `text-neutral-500/600/700/800/900` and `bg-neutral-50/100`, plus Tailwind's named colours for meaning: `green-700`, `amber-700` and `blue-700` in the report; `amber-50` for the Top improvement card; `red-600` for errors.
- **Hard-coded hex values outside the homepage (39):**
  - `lib/drills/progress/dashboard.ts`: the six skill-state colours, a blue ramp from `#e5e7eb` to `#172554`.
  - `components/drills/chart.tsx`: six series colours (`#2f6fb5`, `#c9822b`, `#2f8f62`, `#8b5fbf`, `#c4515a`, `#5b6472`) and the up and down colours.
  - `components/drills/progress.tsx`: the text colour on those skill-state tiles.
  - `app/api/report/[sessionId]/pdf/report-pdf.tsx`: 20 values for the PDF report. They have to stay as hex, since react-pdf can't read CSS variables, but they can take the palette's values.
- **Layout.** Every app page is a single 672px column (`max-w-2xl`, 16px gutters), white, with 14px body text and 18–24px headings. The homepage uses 1240px pages, Paper backgrounds and 16–18px body text.
- **Motion.** There is almost none. Two existing pieces conflict with the brief:
  - The text interview's "typing" indicator bounces three dots in a loop while the student waits (`chat-window.tsx`), a looping animation while the student is working.
  - A spinner loops in the drill runner while a set is graded.
- **DESIGN.md (local, uncommitted).** It still describes this greyscale app ("a calm, greyscale practice room"), not the homepage. It should be regenerated at the end, so the design guidance matches what ships.

**Shared versus per screen.** Buttons, cards and inputs come from `components/ui`, so restyling those four files plus the tokens in `globals.css` re-skins about half of the app at once. Everything else is per screen: text colours, borders, spacing and the report's verdict colours are written inline on each page.

## 3. Screen inventory

Effort: **S** is under an hour, mostly classes. **M** is a few hours, with layout or hierarchy decisions. **L** is a day or more, with many states or sensitive logic nearby.

| Area | Route or piece | Files | Effort | Notes |
|---|---|---|---|---|
| Shared | Header, page shell, feedback button | `site-header.tsx`, `app/drills/layout.tsx`, `drills/feedback.tsx` | M | The header becomes the homepage's slim header (Paper, CasePace wordmark, links). |
| Shared | Button, Card, Badge, Input | `components/ui/*` | M | Foundations. |
| Auth | `/sign-in` (email, then club code) | `sign-in-flow.tsx` | S | |
| Onboarding | `/drills/start` (set up training) | `drills/onboarding-form.tsx` | S | |
| Onboarding | `/drills/questionnaire` | `drills/questionnaire-form.tsx` | S | |
| Diagnostic | `/drills/diagnostic` and its results | `drills/diagnostic-actions.tsx`, `prescription-actions.tsx` | M | |
| Plan and dashboard | `/drills` (today's workout, resume, weakest skill) | `app/drills/page.tsx` (279 lines) | L | The training home. Several equal-weight buttons, so the one-primary rule matters most here. |
| Plan and dashboard | `/drills/plan` | `app/drills/plan/page.tsx` | M | Plan progress → progress line. |
| Plan and dashboard | `/drills/progress` and `/drills/progress/[skillId]` | `drills/progress.tsx`, `chart.tsx` | M | Skill states → palette (decision 3). |
| Plan and dashboard | `/home` (start a case, drills, past sessions) | `home-view.tsx`, `start-case-button.tsx` | M | |
| Lessons | `/drills/learn` (index) | `app/drills/learn/page.tsx` | S | |
| Lessons | `/drills/learn/intro` | `drills/lesson.tsx` | S | |
| Lessons | `/drills/learn/[skillId]` (one lesson) | `drills/lesson.tsx`, `lesson-actions.tsx` | M | **Pilot.** |
| Drills | `/drills/browse` (pick a drill) | `app/drills/browse/page.tsx`, `pick-drill.tsx` | S | |
| Drills | `/drills/sets/[setId]` (the drill runner) | `drills/runner.tsx` (708 lines), `timer.tsx`, `step-inputs.tsx`, `numeric-input.tsx`, `feedback.tsx`, `grading-wait.tsx`, `chart.tsx` | L | **Pilot.** The timer and the set's state live here. |
| Drills | `/drills/sets/[setId]/results` | `drills/results.tsx`, `retry-button.tsx` | M | |
| Drills | `/drills/reports` (Report a problem, grade disputes) | `app/drills/reports/page.tsx`, `report-review.tsx` | M | |
| Settings | `/drills/settings` | `drills/program-settings.tsx` | S | |
| Mock interview | `/start/[caseId]` (link-only start, such as the demo case) | `app/start/[caseId]/page.tsx` | S | |
| Mock interview | `/case/[id]` (text interview) | `chat-window.tsx`, `exhibit-table.tsx`, `case-end-panel.tsx`, `prepare-report.tsx`, `post-case-survey.tsx` | L | Exhibits → window frame. The typing dots loop. |
| Mock interview | `/case/[id]/voice` | `voice-room.tsx` (414 lines), `live-caption.tsx` | L | Classes only, next to the audio and connection logic. |
| Feedback | `/case/[id]/report` | `report/page.tsx`, `report-card.tsx` | M | Verdict colours (decision 2). |
| Feedback | The PDF report | `report-pdf.tsx` | S | Palette hex values only. |
| Internal | `/drills/review/lessons`, `/drills/review/reports` | Reviewer tools (lessons: local development only) | S | Last, tokens only. |
| Redirect | `/drills/profile` | redirect to `/drills/progress` | none | |
| Missing | Not-found, error and loading pages | none (Next's defaults) | S | Styling them means adding small new pages. **Ask first** (decision 7). |

## 4. Risks

- **Logic next to styling.** These files hold state, timers or the voice connection, so changes there will touch class names and wrappers only, never hooks, handlers or effects:
  - `runner.tsx` (the timer, step state, grading wait), `timer.tsx` (the countdown, its warning and its screen-reader announcement), `voice-room.tsx` (LiveKit audio, the connection states, the leave beacon) and `chat-window.tsx` (turn streaming).
  - Wrapping an element can break a ref or a focus target, so each of these gets a click-through after its commit.
- **Case data in exhibits.** Charts and tables show ledger data, so the zero-hallucination audit (FR-4) is untouched: colours and frames only, never content. Chart colours carry meaning (series, up and down), so they need a categorical set that stays distinguishable (decision 4).
- **Checks.**
  - **Tests:** none of the tests reference class names (I searched), so restyling can't break them.
  - **Typecheck:** it currently fails on this machine. The voice packages in `package.json` (LiveKit, Deepgram, Cartesia) aren't installed in `node_modules`. `npm ci` restores them from the lockfile: no new dependency, but I'll run it only with your go.
- **Real data and paid calls during the click-through.**
  - Local development uses the shared CaseTester database, so a test account's drills and diagnostic write real rows.
  - A mock interview costs money (interviewer turns, then scoring on Opus) and counts against the start limits: 2 a day and 8 a month per student, and 150 a month site-wide.
  - A voice interview takes the single voice slot (`VOICE_MAX_CONCURRENT` = 1) for as long as it runs, which a real student could need.
  - My proposal is in decision 6.
- **Conflicts with other branches.**
  - `UI-Overhaul`: mockups only, no overlap.
  - `backup/homepage-swap-oct`: not for merging.
  - `site-flow` and `latency-json-output`: one old commit each, already superseded on main.
  - No other worktrees are open.
  - Main moves fast (security, voice and report work this week), so I'll rebase before each phase and keep each commit to one area.
- **The homepage must look identical after Foundations.** I'll capture the homepage and How it works before and after at 1440 and 390, both with and without reduced motion, and diff the screenshots pixel by pixel.

## 5. Decisions needed before Foundations

1. **Arrow links.** The homepage's "See how it works →" carries the arrow in its text. Adding arrows to the app's links would change their copy, so I'd draw the arrow with CSS instead (`::after`, hidden from screen readers), leaving every label as it is.
2. **Report verdict colours.** I'd use the homepage's own report recreation: Strong in Mastery green, Adequate in Sky, Needs work in Cobalt with white text. "What went well", "What needs work" and "Missed opportunities" currently use green, amber and blue text. They'd become a small marker in those colours beside Ink headings. The amber Top improvement card becomes a Sky card with a Cobalt left rule.
3. **Skill-state colours.** There are six states (not started, learning, recognizes, practiced, mastered, validated) and the homepage shows three of them. I'd use:
   - Not started: white with a border.
   - Learning: Sky.
   - Recognizes: Cobalt at 35%.
   - Practiced: Cobalt.
   - Mastered and Validated: Mastery green; Validated adds a check.

   The question: is Validated a separate stage students should see, or the step that makes a skill Mastered?
4. **Chart colours for exhibits and progress charts.** The brand has one accent, and green is reserved for progress. I'd build a six-colour categorical set led by Cobalt, without green and checked for colour-blind separation. The up and down markers stay as they are, since they show the case data's direction. The alternative is to leave chart colours alone in this pass.
5. **Error and warning colour.** The palette has no red, but errors and the timer's last 10 seconds need one. I'd add one token, the homepage's Live red `#D92D20` darkened for text contrast (to about `#B42318`, 4.5:1 or better on white and Paper), used for errors and that warning only.
6. **Screenshots and the click-through.**
   - Please create a test account with a club code, and give me the names of two environment variables in `.env.local` that hold its email and password. The capture script would read them through `--env-file`, without my seeing them.
   - For the mock interview, I'd use text mode, run once before and once after (about $2–4 each, under your $5 bar), and screenshot the voice page up to its "connecting" state without starting a live voice session.
   - The alternative, with no spend and no database writes, is dev-only pages with sample data (404 outside `next dev`), like the old landing screens. That adds files, so I'd ask first.
7. **Not-found and error pages.** Should they be styled (two small new files), or left as Next's defaults?
8. **Title Case headings.** Some app headings are in Title Case ("Interview Feedback", "Model Answer"), while the homepage uses sentence case. Changing them is a copy change, so it's listed here and not made.
9. **One primary button per screen.** On `/home`, past sessions show a filled "Resume" beside outlined "Report" buttons. The training home and the runner have several primaries. Demoting all but one changes visual emphasis, not behaviour. I'll go by the main action of each screen and show you in the pilot.

## 6. Proposed order

Each phase is one commit (or one per area), after a rebase on main, with typecheck, lint and tests passing.

1. **Foundations** (refactor, no redesign):
   - Move the palette, type roles, buttons, links, panel, window frame, progress line, meter, focus ring and motion tokens into one shared place: `app/globals.css` (`@theme` tokens) plus a small `components/brand/` set (Window, ProgressLine, Meter).
   - Point the homepage at the shared copies, with no visual change, proved by the pixel diff.
   - Map shadcn's tokens to the palette (`--primary` → Cobalt, `--background` → Paper, `--border` → Ink 12%, `--radius` to the homepage's), so `components/ui` follows.
2. **Pilot** (stop for your review):
   - `/drills/sets/[setId]` (a drill set, through answer, feedback and the next item) and `/drills/learn/[skillId]` (one lesson).
   - Before and after screenshots at 1440×900 and 390.
3. **Rollout**, in this order:
   - Drills and lessons: browse, results, learn index and intro, reports.
   - The mock interview: start, text, voice, end panel, survey, report, PDF.
   - The plan and dashboard: `/drills`, plan, progress, `/home`.
   - Auth, onboarding, the questionnaire, the diagnostic, settings, and the reviewer pages.
4. **Cleanup:**
   - Remove the dark theme and shadcn greys that nothing uses any more, the unused Bodoni font, and the one-off classes the shared pieces replaced.
   - Search for leftover hex values and report each one that remains, with its reason.
   - Regenerate DESIGN.md.
5. **Done:**
   - A click-through of sign-up and sign-in, the diagnostic, the plan, a lesson, a drill set, a mock interview, feedback and settings.
   - An accessibility pass (axe, contrast, keyboard) on those flows.
   - Push and open a pull request into main with the screenshots. Not merged.

## 7. Matt's decisions (7 Nov 2026)

1. Arrow links: drawn, not typed. Done as the homepage does it: an arrow icon beside the words, hidden from screen readers, so no label changes.
2. Report verdicts: Strong in Mastery green, Adequate in Sky, Needs work in Cobalt; the Top improvement card becomes Sky. Check text contrast on Sky.
3. Skill states: Validated is the internal step that makes a skill Mastered. Green only for Mastered.
4. Charts: the Cobalt-led six without green, in one fixed order everywhere. Chosen and validated with the dataviz skill's checker: #2D4BD8, #D4581C, #0089A8, #A86A00, #C0307E, #7048C8 (each at least 3:1 on white; worst adjacent colour-blind ΔE 12.5). A waterfall's rises and falls keep their colours (the data's direction).
5. Red: #B42318, for errors and the timer's last 10 seconds only; no flashing or pulsing.
6. Screenshots and the click-through: no test account. Dev-only preview pages with sample data in `app/dev/ui-preview/` (blocked in production, never writing to the database, no real interview or voice session) for every before-and-after. Matt does the real end-to-end click-through on his own account before merging; the PR carries a checklist of the flows.
7. Not-found and error pages: styled.
8. Title Case headings: change the capitalisation only, to sentence case; list every changed heading in the PR. Homepage and product page copy stays untouched.
9. One primary button per screen: agreed; shown in the pilot.

## 8. How the work was done

- **Views.** Each page's markup moved, unchanged, into a view component that takes its data as props (`components/drills/views`, `components/views`); pages keep their data loading, redirects and event logging. The drills layout's frame is `DrillsChrome`.
- **Previews.** `app/dev/ui-preview` renders 36 screens with sample data, much of it from the app's own pure code (authored items and lessons, scoring, plan and chart builders). A guard in the browser answers the screens' requests from sample answers and refuses everything else; ESLint keeps the database and Supabase clients out of the folder. The layout and each page 404 outside development: a production build showed that the layout's 404 alone still streamed the page's sample data (answer keys included), so each page checks too; rechecked on a production build. Remove the folder once the pass is merged.
- **Foundations.** `app/brand.css` (imported by the root layout) holds the palette, the alert red, the six text roles plus the app's title and heading roles, the controls, links, surfaces and motion tokens; the homepage's stylesheets read it. `globals.css` adds Tailwind utilities for the tokens and maps the UI kit's colours onto the palette. Shared pieces in `components/brand`. The homepage and How it works stay pixel-identical (1440 and 390, reduced motion) with identical computed styles on every control and text role.
- **Rollout, in the plan's order**, one area per commit: the pilot (drill set, lesson); drills and lessons; the mock interview; the feedback report and PDF; plan and dashboard; sign-in; onboarding, the questionnaire and settings; the diagnostic; the reviewer tools; the 404 and error pages; then the phone chart reflow (its own commit) and cleanup.
- **Accessibility.** axe (WCAG 2.1 A and AA): 0 violations on all 36 screens and their clicked states, at 1440 and 390. Two keyboard fixes it found: the conversation and wide exhibit tables are focusable scroll regions.
- **Hex values left**, each deliberate: the palette (`app/brand.css`); the chart's categorical set and waterfall direction colours; the skill-state colours (the weekly chart needs plain values); the PDF (react-pdf can't read CSS variables); the homepage's own decoration (untouched by this pass).
- **Known, not changed:** on a line chart, labels of values that sit close together can overlap (as before; the data table has every value). The training home's title is the plan's name and week theme, which can run to two lines.
