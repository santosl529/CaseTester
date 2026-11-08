import { notFound } from 'next/navigation';
import { PreviewApi, type Canned } from '../_lib/guard';
import { SCREENS } from '../_lib/screens';
import { DrillsChrome } from '@/components/drills/views/chrome';

// Sample answers every screen may need: the feedback button on drills pages.
const SHARED: Canned[] = [{ method: 'POST', path: '/api/drills/feedback', body: { ok: true } }];

export default async function PreviewScreen({ params }: { params: Promise<{ screen: string }> }) {
  // Here as well as in the layout: Next renders a layout and its page in
  // parallel, so the layout's 404 alone still sent the page's sample data
  // (answer keys included) in a production build's 404 response.
  if (process.env.NODE_ENV !== 'development') notFound();
  const { screen } = await params;
  const s = SCREENS.find(x => x.slug === screen);
  if (!s) notFound();
  const { node, api = [] } = await s.render();
  return (
    <>
      <PreviewApi routes={[...api, ...SHARED]} />
      {s.chrome === 'drills' ? <DrillsChrome>{node}</DrillsChrome> : node}
    </>
  );
}
