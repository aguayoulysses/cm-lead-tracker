import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'CM Lead Tracker',
  description: 'Follow-ups and sales stats for the closing team',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-40">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <span className="text-sm font-bold tracking-widest text-zinc-100 uppercase">
              CM <span className="text-emerald-400">Lead Tracker</span>
            </span>
            <nav className="flex gap-1 text-sm">
              <Link href="/" className="rounded px-3 py-1.5 hover:bg-zinc-800">
                Work
              </Link>
              <Link href="/stats" className="rounded px-3 py-1.5 hover:bg-zinc-800">
                Stats
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
