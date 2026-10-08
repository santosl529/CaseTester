// Builds drill-review.html: every authored drill item in one readable page,
// for human review (docs/prd-drills.md "Authored items"). Items appear as a
// student sees them, with charts drawn by the app's own renderer, plus the
// answer key a reviewer has to check: the right answer, each wrong option's
// mistake tag and feedback, and the explanation.
//
//   npm run drills:review     then open drill-review.html
//
// Reads /drill-items directly (not lib/drills/authored.ts, which is
// server-only), so it runs without the react-server condition.
import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DrillChart } from '@/components/drills/chart';
import { ItemSchema, type Item } from '@/lib/drills/item-schema';
import { DRILLS_CONFIG, getDrill, getMistakeTag } from '@/lib/drills/config';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'drill-items');
const OUT = path.join(ROOT, 'drill-review.html');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// What the reviewer confirms, from the PRD, plus what each drill's distractors must be.
const CHECKLIST = [
  'The marked answer is correct.',
  'Each wrong option is wrong for exactly the reason its tag names.',
  'There is one defensible best answer.',
  'Numbers and facts are plausible.',
  'No third-party content is reused.',
];
const DRILL_NOTES: Record<string, string> = {
  'PS-1': 'One planted flaw per framework. Wrong options allege a different flaw type.',
  'HY-1': 'Wrong options are each one weak type: restates the facts, shotgun, overconfident, or untestable.',
  'EX-1': 'Wrong takeaways are: true but unimportant, a misreading of the chart, or a claim the data doesn\'t support.',
  'SY-1': 'Wrong options bury the answer, hedge, pad with irrelevant facts, lack numbers, or misstate progress.',
  'CL-1': 'Wrong next steps are already answered, off the objective, a premature solution, or waiting for the interviewer.',
};

function load(): Item[] {
  return fs.readdirSync(DIR, { withFileTypes: true }).filter(d => d.isDirectory()).flatMap(d =>
    fs.readdirSync(path.join(DIR, d.name)).filter(f => f.endsWith('.json')).sort().map(f => {
      const file = path.join(DIR, d.name, f);
      const result = ItemSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf-8')));
      if (!result.success) throw new Error(`${file}: ${result.error.message}`);
      return result.data;
    }));
}

function extras(item: Item): string {
  const rows: string[] = [];
  const e = item.extras as Record<string, unknown>;
  if (typeof e.corrected_framework === 'string') rows.push(`<dt>Corrected framework</dt><dd>${esc(e.corrected_framework)}</dd>`);
  if (typeof e.flaw_type === 'string') rows.push(`<dt>Planted flaw</dt><dd>${esc(e.flaw_type)}</dd>`);
  if (Array.isArray(e.irrelevant_facts)) rows.push(`<dt>Irrelevant fact planted</dt><dd>${esc(e.irrelevant_facts.join('; '))}</dd>`);
  return rows.length ? `<dl class="extras">${rows.join('')}</dl>` : '';
}

function card(item: Item): string {
  const file = path.relative(ROOT, path.join(DIR, item.drill_id, `${item.item_id}.json`));
  const options = item.options.map(o => {
    const tag = o.tag ? getMistakeTag(o.tag) : null;
    return `<li class="${o.correct ? 'right' : 'wrong'}">
      <div class="opt"><span class="letter">${esc(o.id)}</span><span>${esc(o.text)}</span>${o.correct ? '<span class="badge ok">Correct</span>' : ''}</div>
      <div class="why">${o.correct ? '' : `<span class="badge tag" title="${esc(o.tag ?? '')}">${esc(tag?.label ?? o.tag ?? 'no tag')}</span> `}${esc(o.feedback)}</div>
    </li>`;
  }).join('');
  const chart = item.exhibit ? `<div class="chart">${renderToStaticMarkup(createElement(DrillChart, { spec: item.exhibit }))}</div>` : '';
  return `<article class="item" id="${esc(item.item_id)}" data-id="${esc(item.item_id)}">
    <header>
      <label class="done"><input type="checkbox" data-review="${esc(item.item_id)}"> Reviewed</label>
      <strong>${esc(item.item_id)}</strong>
      <span class="meta">Tier ${item.tier} · ${esc((item.case_type ?? 'no case type').replace(/_/g, ' '))} · ${esc(item.status)}${item.is_example ? ' · worked example' : ''}</span>
      <code class="file">${esc(file)}</code>
    </header>
    <p class="prompt">${esc(item.prompt)}</p>
    ${chart}
    <ol class="options">${options}</ol>
    <p class="explanation"><b>Explanation shown after answering:</b> ${esc(item.explanation)}</p>
    ${extras(item)}
  </article>`;
}

function main() {
  const items = load();
  // Catalog order (PS-1, HY-1, EX-1, ...), not alphabetical.
  const present = new Set(items.map(i => i.drill_id));
  const drills = DRILLS_CONFIG.drills.drills.map(d => d.id).filter(id => present.has(id));
  const sections = drills.map(id => {
    const drill = getDrill(id);
    const pool = items.filter(i => i.drill_id === id);
    const skills = DRILLS_CONFIG.taxonomy.skills.filter(s => drill.skills.includes(s.id)).map(s => s.name).join(', ');
    const live = pool.filter(i => i.status === 'live').length;
    return `<section id="drill-${id}">
      <h2>${esc(id)} ${esc(drill.name)} <span class="count">${pool.length} items · ${live} live</span></h2>
      <p class="sub">Skills: ${esc(skills)}. ${esc(DRILL_NOTES[id] ?? '')}</p>
      ${pool.map(card).join('')}
    </section>`;
  }).join('');
  const toc = drills.map(id => `<a href="#drill-${id}">${esc(id)} ${esc(getDrill(id).name)} (${items.filter(i => i.drill_id === id).length})</a>`).join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Drill item review</title>
<style>
  :root { --bg:#f7f7f5; --card:#fff; --fg:#1d1d1b; --muted:#6b6b66; --border:#e2e2dc; --ok:#1f7a4a; --ok-bg:#e8f4ec; --tag:#8a4b0f; --tag-bg:#fbf0e3;
 }
  @media (prefers-color-scheme: dark) { :root { --bg:#161615; --card:#1f1f1d; --fg:#ecebe6; --muted:#a3a29b; --border:#34342f; --ok:#6fcf97; --ok-bg:#1d3326; --tag:#f0b46b; --tag-bg:#3a2a17; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 80px; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 20px; margin: 40px 0 4px; } .count, .sub, .meta { color: var(--muted); font-weight: 400; } .count { font-size: 14px; }
  .intro { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin: 16px 0; }
  .intro ol, .intro ul { margin: 6px 0; padding-left: 20px; } .intro pre { background: var(--bg); padding: 8px 10px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
  nav { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--border); padding: 8px 0; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 14px; }
  nav a { color: inherit; } #progress { margin-left: auto; color: var(--muted); }
  .item { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin: 14px 0; }
  .item.reviewed { opacity: .55; }
  .item header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 8px; }
  .file { font-size: 12px; color: var(--muted); width: 100%; } .done { font-size: 13px; color: var(--muted); cursor: pointer; }
  .prompt { font-size: 16px; margin: 6px 0 12px; }
  .options { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
  .options li { border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; }
  .options li.right { border-color: var(--ok); background: var(--ok-bg); }
  .opt { display: flex; gap: 10px; align-items: baseline; } .letter { font-weight: 600; min-width: 1em; }
  .why { color: var(--muted); font-size: 13.5px; margin: 4px 0 0 26px; }
  .badge { display: inline-block; font-size: 12px; border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
  .badge.ok { background: var(--ok); color: #fff; margin-left: auto; } .badge.tag { background: var(--tag-bg); color: var(--tag); }
  .explanation { font-size: 14px; margin: 12px 0 4px; }
  .extras { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 13.5px; margin: 8px 0 0; color: var(--muted); }
  .extras dt { font-weight: 600; } .extras dd { margin: 0; }
  .chart { margin: 8px 0 14px; } .chart svg { width: 100%; height: auto; max-width: 640px; display: block; }
  .chart figcaption span { display: block; color: var(--muted); font-size: 13px; }
  .chart table { border-collapse: collapse; font-size: 13.5px; margin-top: 6px; } .chart th, .chart td { border: 1px solid var(--border); padding: 3px 8px; text-align: left; }
  .chart p { color: var(--muted); font-size: 12.5px; margin: 4px 0 0; } .chart details { font-size: 13px; margin-top: 4px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style></head>
<body><div class="wrap">
<h1>Drill item review</h1>
<p class="sub">${items.length} authored items. Generated ${new Date().toLocaleDateString('en-CA')} from /drill-items. Regenerate with <code>npm run drills:review</code> after editing.</p>
<div class="intro">
  <b>For each item, check that:</b>
  <ul>${CHECKLIST.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
  <b>To fix an item,</b> edit the JSON file named under its ID.<br>
  <b>To approve an item,</b> set these fields in its file:
  <pre>"status": "live",
"authorship": { "author_of_record": "Your Name", "drafting_model": "claude-opus-5-5",
                "reviewed_by": "Your Name", "reviewed_at": "YYYY-MM-DD", "similarity_check": "passed" }</pre>
  Mark one reviewed item per drill <code>"is_example": true</code> as its worked example. The "Reviewed" checkboxes here only track your progress in this browser; they don't change any files.
</div>
<nav>${toc}<span id="progress"></span></nav>
${sections}
</div>
<script>
  // Progress checkboxes, saved in this browser only.
  const KEY = 'drill-review-done';
  let done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  const boxes = [...document.querySelectorAll('[data-review]')];
  const update = () => {
    for (const b of boxes) b.closest('.item').classList.toggle('reviewed', b.checked);
    document.getElementById('progress').textContent = boxes.filter(b => b.checked).length + ' of ' + boxes.length + ' reviewed';
  };
  for (const b of boxes) {
    b.checked = Boolean(done[b.dataset.review]);
    b.addEventListener('change', () => {
      done[b.dataset.review] = b.checked;
      try { localStorage.setItem(KEY, JSON.stringify(done)); } catch {}
      update();
    });
  }
  update();
</script>
</body></html>`;
  fs.writeFileSync(OUT, html);
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${items.length} items across ${drills.length} drills`);
}

main();
