"use client"

import { useMemo } from "react"

/**
 * Scannable-looking Code128-style barcode rendered from an arbitrary string.
 *
 * Deliberately not a spec-accurate Code128 encoder: it derives a stable bit
 * pattern from the value's characters so the same barcode always renders the
 * same way. That is enough for on-screen display, and keeps the workspace free
 * of a barcode dependency. Anything that must actually be scanned by a
 * handheld should read the stored barcode value, not this image.
 */
export function Barcode({ value, className = "" }: { value: string; className?: string }) {
  const bits = useMemo(() => patternFor(value), [value])
  if (!value.trim()) return null
  return (
    <span
      className={`inline-flex items-stretch gap-px overflow-hidden rounded bg-white p-1 ${className}`}
      role="img"
      aria-label={`Barcode ${value}`}
    >
      {bits.map((wide, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="bg-slate-900"
          style={{ width: wide ? 3 : 1 }}
        />
      ))}
    </span>
  )
}

/** Stable pseudo-random widths derived from the value, so it never re-shuffles. */
function patternFor(value: string): boolean[] {
  let seed = 0
  for (let i = 0; i < value.length; i += 1) {
    seed = (seed * 31 + value.charCodeAt(i)) >>> 0
  }
  const bits: boolean[] = []
  for (let i = 0; i < 48; i += 1) {
    seed = (seed * 1103515245 + 12345) >>> 0
    bits.push((seed >>> 16) % 3 === 0)
  }
  return bits
}

export function BarcodeValue({ value, className = "" }: { value: string; className?: string }) {
  if (!value.trim()) return null
  return (
    <span className={`flex flex-col items-center gap-1 ${className}`}>
      <Barcode value={value} />
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground">{value}</span>
    </span>
  )
}