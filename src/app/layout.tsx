import type { Metadata } from 'next';
import Link from 'next/link';
import { HeaderMenu } from '@/components/header-menu';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cavenaugh · Lead Tracker',
  description: 'Follow-ups and sales stats for the closing team',
  // Keep dark-mode extensions (Dark Reader) from inverting the brand palette.
  other: { 'darkreader-lock': 'true', 'color-scheme': 'only light' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-line bg-card">
          <div className="mx-auto flex max-w-6xl items-center gap-8 px-5 py-3">
            <span className="flex items-baseline gap-2">
              <span className="text-[15px] font-bold tracking-wide text-navy">CAVENAUGH</span>
              <span className="text-[13px] font-medium tracking-wide text-muted">Lead Tracker</span>
            </span>
            <nav className="flex gap-6 text-sm font-medium">
              <Link href="/" className="text-ink hover:text-navy">
                Work
              </Link>
              <Link href="/stats" className="text-ink hover:text-navy">
                Stats
              </Link>
            </nav>
            <HeaderMenu />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>
      </body>
    </html>
  );
}
