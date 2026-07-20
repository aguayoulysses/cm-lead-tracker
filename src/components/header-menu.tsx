'use client';

import { useEffect, useRef, useState } from 'react';

/** Small utility menu in the header for rarely-used links (onboarding, docs). */
export function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-auto">
      <button
        aria-label="Settings and resources"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg border p-2 transition-colors ${
          open ? 'border-blue bg-bluesoft text-blueink' : 'border-line text-muted hover:border-blue hover:text-navy'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="card absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden shadow-lg">
          <p className="eyebrow border-b border-line px-3 py-2 text-faint">Resources</p>
          <a
            href="/onboarding.html"
            target="_blank"
            rel="noopener"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 hover:bg-bluesoft"
          >
            <span className="text-sm font-semibold text-ink">Closer onboarding</span>
            <span className="block text-xs text-muted">Tools walkthrough &amp; SOPs — opens in a new tab</span>
          </a>
          <a
            href="/daily-flow.html"
            target="_blank"
            rel="noopener"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-3 py-2.5 hover:bg-bluesoft"
          >
            <span className="text-sm font-semibold text-ink">Daily flow</span>
            <span className="block text-xs text-muted">Your day in order — queue, calls, forms, EOD, KPIs</span>
          </a>
        </div>
      )}
    </div>
  );
}
