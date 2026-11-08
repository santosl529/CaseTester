import './palette.css';

// The public site: the homepage and How it works (Matt's exhibition design,
// UI-Overhaul 5b8364b2; live since the site launch, 31 Oct 2026). The pages
// set their own metadata.

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      {children}
    </div>
  );
}
