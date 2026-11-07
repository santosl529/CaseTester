import { notFound } from 'next/navigation';
import { PreviewApi, type Canned } from '../_lib/guard';
import { SCREENS } from '../_lib/screens';

// Sample answers every screen may need: the feedback button on drills pages.
const SHARED: Canned[] = [{ method: 'POST', path: '/api/drills/feedback', body: { ok: true } }];

export default async function PreviewScreen({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  const s = SCREENS.find(x => x.slug === screen);
  if (!s) notFound();
  const { node, api = [] } = await s.render();
  return (
    <>
      <PreviewApi routes={[...api, ...SHARED]} />
      {node}
    </>
  );
}
