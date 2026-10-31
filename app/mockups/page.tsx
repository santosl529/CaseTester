import Link from 'next/link';

const CONCEPTS = [
  { href: '/mockups/case-report', name: 'The Case Report', line: 'A premium consulting deliverable: chapters, exhibits, a key-findings slide.' },
  { href: '/mockups/control-room', name: 'The Control Room', line: 'Dark and precise: the product UI as a lit console, Cobalt as glow.' },
  { href: '/mockups/skill-map', name: 'The Skill Map', line: 'The skill graph as the page: sections level up from Sky to Cobalt to green.' },
  { href: '/mockups/hybrid', name: 'Hybrid', line: 'The Case Report, with the technology chapter in the Control Room’s dark style.' },
  { href: '/mockups/exhibition-v1', name: 'Exhibition v1', line: 'The first exhibition: hero loop, annotated chat replay, plan timeline.' },
  { href: '/mockups/exhibition-v2', name: 'Exhibition v2', line: 'The guided ride before the attention pass: six chapters, sticky loop rail.' },
  { href: '/mockups/exhibition-v3', name: 'Exhibition v3', line: 'The guided ride, refined: sticky header, skip link, scroll-scrubbed chapters, Lorenzo’s story; the node diagram for the technology.' },
  { href: '/mockups/exhibition-v4', name: 'Exhibition v4', line: 'v3 with the technology as a scroll-scrubbed exploded view: one answer falling through five layers.' },
  { href: '/mockups/exhibition-v5', name: 'Exhibition v5', line: 'For the record: v4 lit like a film (Paper and white rooms, Ink technology, ?into=a or b), plus the critique’s quality fixes.' },
  { href: '/mockups/exhibition-v6', name: 'Exhibition v6', line: 'v4 with Apple-style reveals, before the chapter copy rewrite.' },
  { href: '/mockups/exhibition-v7', name: 'Exhibition v7', line: 'v6 with Matt’s rewritten chapter copy, before the split into a homepage and a product page.' },
  { href: '/mockups/exhibition-v8', name: 'Exhibition v8', line: 'The two-page split as CaseTester, with a text interview in “What sets us apart” (product page at /mockups/exhibition-v8/product).' },
  { href: '/mockups/exhibition-v9', name: 'Exhibition v9', line: 'CasePace with the pinned laptop in “What sets us apart” and the live voice interview (product page at /mockups/exhibition-v9/product).' },
  { href: '/mockups/exhibition-v10', name: 'Exhibition v10', line: 'Stacking consulting slides before the characters (product page at /mockups/exhibition-v10/product).' },
  { href: '/mockups/exhibition-v11', name: 'Exhibition v11', line: 'CasePace slides with the characters, before the loop’s product previews and progress line (product page at /mockups/exhibition-v11/product).' },
  { href: '/mockups/exhibition-v12', name: 'Exhibition v12', line: 'The loop’s progress line and the contact buttons, with the Technology section before it became the fourth slide (product page at /mockups/exhibition-v12/product).' },
  { href: '/mockups/exhibition-v13', name: 'Exhibition v13', line: 'The Under the hood slide, before the loop’s scroll runway and the header button hiding at the close (product page at /mockups/exhibition-v13/product).' },
  { href: '/mockups/exhibition', name: 'Exhibition', line: 'The homepage as CasePace: stacking consulting slides with the CasePace characters.' },
  { href: '/mockups/exhibition/product', name: 'Exhibition · Product', line: 'How it works: the loop and the six chapters, moved here from the homepage.' },
  { href: '/mockups/interactive', name: 'Interactive', line: 'Try a 3-question diagnostic in the hero, then watch an annotated interview replay.' },
];

// An index of the four homepage mockups (Matt, 21 Oct 2026).
export default function MockupsIndex() {
  return (
    <main data-mockup className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold">Homepage mockups</h1>
      <p className="mt-2 text-(--ink)/70">Visual directions for the homepage, and an interactive layout to try it in place. The live homepage is unchanged.</p>
      <ul className="mt-8 divide-y divide-(--ink)/15 border-y border-(--ink)/15">
        {CONCEPTS.map(c => (
          <li key={c.href} className="py-4">
            <Link href={c.href} className="font-semibold text-(--cobalt) underline-offset-4 hover:underline">{c.name}</Link>
            <p className="mt-1 text-sm text-(--ink)/70">{c.line}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
