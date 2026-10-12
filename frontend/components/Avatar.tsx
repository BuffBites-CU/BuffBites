'use client'

import { useEffect, useState } from 'react'

/**
 * Hand-drawn line-art avatar for a username ("Notionists" by Zoish, CC0, via
 * DiceBear). The same username always gets the same face. The ~500 KB avatar
 * library is loaded lazily, so it never blocks first paint; until it arrives
 * we show the user's initial.
 */

const cache = new Map<string, string>()
let lib: Promise<{ make: (seed: string) => string }> | null = null

function loadLib() {
  lib ??= Promise.all([import('@dicebear/core'), import('@dicebear/notionists')]).then(
    ([core, style]) => ({
      make: (seed: string) =>
        core.createAvatar(style, { seed, backgroundColor: ['transparent'] }).toDataUri(),
    }),
  )
  return lib
}

interface Props {
  name: string
  size?: number
  className?: string
}

export default function Avatar({ name, size = 40, className = '' }: Props) {
  const seed = name || 'buff'
  const [src, setSrc] = useState<string | null>(() => cache.get(seed) ?? null)

  useEffect(() => {
    if (cache.has(seed)) { setSrc(cache.get(seed)!); return }
    let alive = true
    loadLib()
      .then(({ make }) => {
        const uri = make(seed)
        cache.set(seed, uri)
        if (alive) setSrc(uri)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [seed])

  return (
    <span
      className={`relative inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-overlay ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="h-full w-full scale-110 animate-pop-in" />
      ) : (
        <span className="font-display text-brand-black" style={{ fontSize: size * 0.45 }}>
          {seed[0]?.toUpperCase()}
        </span>
      )}
    </span>
  )
}
