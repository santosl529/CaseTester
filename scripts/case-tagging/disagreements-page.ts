// The review page for Matt's rulings on the cross-check disagreements (Matt,
// 15 Nov: "send me only the disagreements"): each point with Claude's label
// and rule, Opus's label and reason, and both tags' definitions. Different
// skills first. Matt picks a label per point; "Copy my rulings" gives text to
// paste back. Free.
//
//   npx tsx scripts/case-tagging/disagreements-page.ts <cross-check.json> <out.html>
import fs from 'fs';
import { getMistakeTag, getSkill } from '@/lib/drills/config';
import { TAG_DEFINITIONS, TAGGING_RULES } from '@/lib/scoring/skill-tag-rules';
import { RUBRIC_DIMENSION_LABELS, type RubricDimensionKey } from '@/lib/scoring/rubric';

type Row = { id: string; group: string; rating: string | null; point: string; quotes: string[]; claude: string | null; claude_rule: string; opus: string | null; opus_reason: string; different_skill: boolean };
const [input, out] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(input, 'utf-8')) as { model: string; cost_usd: number; labelled: number; of: number; disagreements: Row[] };
const rows = [...data.disagreements].sort((a, b) => Number(b.different_skill) - Number(a.different_skill));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ruleText = new Map([...TAGGING_RULES.matchAll(/^([A-Z]\d)\. (.*)$/gm)].map(m => [m[1], m[2]]));
const tagLine = (tag: string | null) => {
  if (!tag) return '<span class="tag">none</span><p class="def">No tag: no drill is recommended for this point.</p>';
  const t = getMistakeTag(tag)!;
  return `<span class="tag">${esc(t.label)}</span> <span class="skill">${esc(getSkill(t.skill).name)}</span><p class="def">${esc(TAG_DEFINITIONS[tag] ?? '')}</p>`;
};
const groupName = (g: string) => (g === 'topFix' ? 'Top improvement' : RUBRIC_DIMENSION_LABELS[g as RubricDimensionKey]);
const ratingName: Record<string, string> = { needs_work: 'Needs work', meets_bar: 'Adequate', strong: 'Strong' };

const cards = rows.map((r, i) => `
<article class="card${r.different_skill ? ' skill' : ''}" id="d${i + 1}">
  <header><span class="n">${i + 1}</span><span class="grp">${esc(groupName(r.group))}${r.rating ? ` · rated ${ratingName[r.rating] ?? r.rating}` : ''}</span>${r.different_skill ? '<span class="flag">Different skill</span>' : '<span class="flag same">Same skill or a miss</span>'}</header>
  <p class="point">${esc(r.point)}</p>
  ${r.quotes.length ? `<ul class="quotes">${r.quotes.map(q => `<li>“${esc(q)}”</li>`).join('')}</ul>` : ''}
  <div class="pair">
    <section><h3>Claude's label</h3>${tagLine(r.claude)}<p class="why"><b>${esc(r.claude_rule)}</b> ${esc(ruleText.get(r.claude_rule) ?? '')}</p></section>
    <section><h3>Opus's label</h3>${tagLine(r.opus)}<p class="why">${esc(r.opus_reason)}</p></section>
  </div>
  <fieldset><legend class="sr">Your ruling on ${i + 1}</legend>
    <label><input type="radio" name="r${i + 1}" value="Claude"> Claude's</label>
    <label><input type="radio" name="r${i + 1}" value="Opus"> Opus's</label>
    <label><input type="radio" name="r${i + 1}" value="Other"> Neither</label>
    <input type="text" id="note${i + 1}" aria-label="Note on ${i + 1}" placeholder="Note (optional)">
  </fieldset>
  <p class="id">${esc(r.id)}</p>
</article>`).join('');

const html = `<title>Tagging Disagreements</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400&display=swap">
<style>
/* Layout: one review column of cards, a sticky bar with progress and the copy button. */
:root { --bg:#F7F7F4; --surface:#FFFFFF; --fg:#0E1424; --muted:#565B68; --rule:#E1E2E5; --accent:#2D4BD8; --soft:#DCE5FF; --warn:#B42318; --warn-soft:#FDECEA;
  --font: "Geist", ui-sans-serif, system-ui, sans-serif; --mono: "Geist Mono", ui-monospace, Menlo, monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0D111C; --surface:#151B2A; --fg:#E8EAF0; --muted:#A3A9B8; --rule:#283043; --accent:#8DA2FF; --soft:#24305A; --warn:#FF8A80; --warn-soft:#3A1D1D; color-scheme: dark; } }
:root[data-theme="dark"] { --bg:#0D111C; --surface:#151B2A; --fg:#E8EAF0; --muted:#A3A9B8; --rule:#283043; --accent:#8DA2FF; --soft:#24305A; --warn:#FF8A80; --warn-soft:#3A1D1D; color-scheme: dark; }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--fg); font-family: var(--font); font-size: 15px; line-height: 1.55; margin: 0;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 32px 80px; }
main { max-width: 52rem; margin: 0 auto; display: grid; gap: 16px; }
h1 { font-size: 1.8rem; margin: 0; letter-spacing: -0.01em; text-wrap: balance; }
h3 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 0 0 4px; font-weight: 500; }
p { margin: 0; }
.lede { color: var(--muted); max-width: 44rem; }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; background: var(--bg); padding-block: 10px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; border-bottom: 1px solid var(--rule); }
.bar button { font: inherit; font-weight: 600; background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
:root[data-theme="dark"] .bar button { color: #0D111C; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .bar button { color: #0D111C; } }
.bar output { color: var(--muted); font-variant-numeric: tabular-nums; }
.card { background: var(--surface); border: 1px solid var(--rule); border-radius: 12px; padding: 16px 18px; display: grid; gap: 10px; }
.card.skill { border-color: var(--warn); }
.card header { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.n { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 1.8rem; }
.grp { font-weight: 600; }
.flag { font-size: 0.78rem; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--warn-soft); color: var(--warn); }
.flag.same { background: var(--soft); color: var(--fg); }
.point { font-size: 1rem; }
.quotes { margin: 0; padding-left: 1.1rem; color: var(--muted); display: grid; gap: 2px; font-size: 0.92rem; }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 12px; }
.pair section { background: var(--bg); border-radius: 8px; padding: 10px 12px; min-width: 0; }
.tag { font-weight: 600; }
.skill { font-size: 0.85rem; color: var(--muted); }
.def { font-size: 0.88rem; color: var(--muted); margin-top: 2px; }
.why { font-size: 0.9rem; margin-top: 6px; }
fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
fieldset label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
fieldset input[type=text] { flex: 1 1 14rem; min-width: 0; font: inherit; padding: 6px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); color: var(--fg); }
.id { font-family: var(--mono); font-size: 0.72rem; color: var(--muted); overflow-wrap: anywhere; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
details { background: var(--surface); border: 1px solid var(--rule); border-radius: 12px; padding: 12px 16px; }
details pre { white-space: pre-wrap; font-family: var(--mono); font-size: 0.8rem; margin: 10px 0 0; }
</style>
<main>
  <h1>Tagging disagreements</h1>
  <p class="lede">${data.labelled} golden points were labelled again by ${esc(data.model)} from the written rules alone, without seeing Claude's labels. These ${rows.length} are where the two differ. ${rows.filter(r => r.different_skill).length} of them point to a different skill (red border), which would send a student to a different drill; they come first. Neither label changes until you rule. Pick one per point, add a note if a rule needs changing, then copy your rulings into the chat.</p>
  <div class="bar"><button type="button" id="copy">Copy my rulings</button><output id="count">0 of ${rows.length} ruled</output><output id="copied" aria-live="polite"></output></div>
  ${cards}
  <details><summary>The written rules (for reference)</summary><pre>${esc(TAGGING_RULES)}</pre></details>
</main>
<script>
(function () {
  var total = ${rows.length};
  var KEY = 'tagging-rulings';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  var state = load();
  for (var i = 1; i <= total; i++) {
    var s = state[i] || {};
    if (s.pick) { var r = document.querySelector('input[name="r' + i + '"][value="' + s.pick + '"]'); if (r) r.checked = true; }
    if (s.note) document.getElementById('note' + i).value = s.note;
  }
  function count() { var n = 0; for (var i = 1; i <= total; i++) if (document.querySelector('input[name="r' + i + '"]:checked')) n++; document.getElementById('count').textContent = n + ' of ' + total + ' ruled'; }
  document.addEventListener('change', function (e) {
    var m = e.target.name && e.target.name.match(/^r(\\d+)$/);
    if (m) { state[m[1]] = state[m[1]] || {}; state[m[1]].pick = e.target.value; save(state); count(); }
  });
  document.addEventListener('input', function (e) {
    var m = e.target.id && e.target.id.match(/^note(\\d+)$/);
    if (m) { state[m[1]] = state[m[1]] || {}; state[m[1]].note = e.target.value; save(state); }
  });
  count();
  function text() {
    var lines = [];
    for (var i = 1; i <= total; i++) {
      var c = document.querySelector('input[name="r' + i + '"]:checked');
      var note = document.getElementById('note' + i).value.trim();
      lines.push(i + ': ' + (c ? c.value : '(not ruled)') + (note ? ' — ' + note : ''));
    }
    return 'Tagging rulings\\n' + lines.join('\\n');
  }
  document.getElementById('copy').addEventListener('click', function () {
    var t = text(), out = document.getElementById('copied');
    var done = function () { out.textContent = 'Copied.'; };
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('aria-label', 'Your rulings'); ta.style.width = '100%'; ta.rows = 8;
      out.textContent = 'Copy the text below:'; out.after(ta); ta.select();
    };
    try { navigator.clipboard.writeText(t).then(done, fallback); } catch (e) { fallback(); }
  });
})();
</script>
`;
fs.writeFileSync(out, html);
console.log(`wrote ${out}: ${rows.length} disagreements`);
