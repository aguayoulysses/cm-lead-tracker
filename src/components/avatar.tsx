'use client';

import { useState } from 'react';

/**
 * Closer headshot from /public/avatars/<name>.png, falling back to an
 * initials disc for anyone without a photo yet.
 */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = `/avatars/${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
  if (!name || broken) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-bluesoft font-bold text-blueink"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {(name || '?').slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full border border-line object-cover"
      style={{ width: size, height: size }}
    />
  );
}
