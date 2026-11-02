# Site parity: every remaining difference from Matt's export

Reference: `reference/exhibition-artifact.html` ("CasePace Exhibition", Matt's export of the homepage). Side-by-side screenshots are in `screenshots/<section>/<width>/f<n>-side-by-side.png`. The reference is on the left and ours on the right. The `f<n>` frames step through each section from top to bottom (scroll-driven sections get several). `screenshots/report.json` gives the share of differing pixels per frame.

Exceptions: **(a)** the reference's wording claims something that isn't true, so our honest wording stands in the same place and style. **(b)** calls to action are real links to `/sign-in?next=/home`.

## Is the reference newer than UI-Overhaul 5b8364b2?

No. It is a snapshot from before 5b8364b2's last edits. Every string and component in it matches `app/mockups/exhibition` at 5b8364b2, apart from two pieces of the voice call:

- the case-stage bar (Clarify · Structure · Analysis · Recommendation) in the call's top bar;
- the hero call's stage changing with the scene.

The reference has these. 5b8364b2 does not: they came out on 29 Oct ("taken out on 29 Oct, Matt", `voice-call.tsx`). The older saved versions (v9–v13) still have them. The other strings only the bundle carries (the "Recalibrates automatically…" landing copy, "Scored on all 8 skills", "/landing/plan.png") belong to modules bundled but never rendered. They come from the old landing components, not the exhibition.

**Not ported: the case-stage bar.** The real voice page (`components/voice-room.tsx`) draws no stages, so the bar shows a feature that doesn't exist (exception a). Matt also removed it himself. **Lorenzo to rule:** keep it out (the default), or port it.

## Remaining differences, by section (all widths unless noted)

| Section | Difference | Exception |
|---|---|---|
| Sticky header | Button "Start a mock interview" (phone: "Start"), a link, not "Take the free diagnostic" / "Free diagnostic", a button whose label only changed on click. The narrower button moves "Product" right. | b (and a: there is no free diagnostic entry point) |
| Sticky header | The hidden header is `inert` in ours and not in the reference. The export runs React 18, which ignores `inert`, so its hidden header stays focusable and clickable. Matt's source sets `inert`, and React 19 applies it. No visual difference. | Not an exception. The export's React version loses the attribute; matching it would bring back a bug. |
| Hero | Headline, subhead and line under the button reworded (copy-changes rows 1–2). The longer headline wraps one more line, so the hero is 67px taller at 1440, 69px at 768 and 93px at 390. Every section below starts that much lower. | a |
| Hero demo | Step 3 shows the feedback report quoting the slip, not "Lorenzo's plan" gaining a workout row. Step label "In your report", not "Plan adapts" (rows 3–4). | a |
| Hero demo | Frames catch the 12-second loop at slightly different moments, since load and scroll timing differ. The timings are identical (5s / 3s / 4s). | None (capture timing, not a difference) |
| Stats band | 8 · 4 · 18 · 23 · 24/7 with our labels, counted on the server, not 8 · 20+ · 200+ · 10+ · 24/7. | a |
| The loop | Diagnose, Your plan and Plan updates card text (rows 5–7). The Diagnose card wraps to 3 lines, so the row sits 9px lower at 1440. Meter label "Progress", not "Readiness" (row 48). | a |
| What sets us apart | Headline (row 26): 4 lines, not 3, so the slide stack starts about 53px lower. Bodies of slides 01–03 (rows 27–29). Characters' roles (rows 36–38). | a |
| What sets us apart | Slide 02 workout row "From your drills…", not "From your mock interview…". | a |
| What sets us apart | Slide 03 drill: the follow-up box ("The CFO tells the board…", "Your reply · up to 60 words") holds the drill's real feedback in the same box and style: "Worked solution" with the arithmetic, and "Correct answer: 2 percentage points" in the reply line's place. Mental math drills have no follow-up questions. | a |
| What sets us apart | 4 controls in the reference, 3 in ours. The reference's call to action is a `<button>`; ours is a link. | b |
| Under the hood | Body (row 32), layer 02 (rows 50, 52) and layer 04 text: "Drill mistakes map to one of 67 error types, so feedback names the exact slip", not "Every mistake maps to one of 60+ error types, each with drills to fix it". The taxonomy has 67 error types, but only 50 belong to a skill with a live drill, so "each with drills to fix it" is false for 17. The text keeps Matt's three lines. | a |
| The close | Headline drops "It's free."; subhead reworded (row 25). One line shorter at 390 (475px vs 520px). | a |
| Footer | None. "Product" is restored (see below). | None |

## Fixed in this round (they were differences that weren't exceptions)

- **Body text rendered in Times** on every page. `--font-sans` in `app/globals.css` was defined as itself, so it resolved to nothing. Now Geist, as in the export.
- **Footer "CasePaceis not affiliated…"**: the compiler dropped the space after `{BRAND}`. Now explicit.
- **Nav and footer link back to "Product"** (copy-changes rows 45–46 reverted; the label wasn't false, it named the route).
- **Hero step 2 back to "Gap caught"** (part of row 3 reverted; it's true, the interviewer catches the slip).
- **Slide 01 tag back to "Live voice"** (row 31 reverted; true, if incomplete).
- **Slide 03 lesson title back to "Percentages vs. percentage points"** (row 33 reverted). The lesson covers exactly that. The longer real title wrapped to three lines and clipped the card's top line ("Percentages · short lesson").
- **Slide 03 drill box restored** with honest content (row 34 replaced; see the table).

## /how-it-works

The export has no How it works page (its bundle renders only the homepage), so there is nothing to compare side by side. It shares the header, loop, call, close and footer components with the homepage, which are compared above. Its own chapters differ from Matt's source (5b8364b2) only by copy-changes rows 8–20, 39–43 and 47, all exception (a) or (b). Two of those rows remove an element rather than reword it: the report's stage strip (row 19, since the report has no stage breakdown) and "Day 1: Focus area" (row 18, since the report doesn't compare sessions).
