/**
 * Adaptive byte formatting for quota displays. Sub-GB usage must not render
 * as "0GB" (see the billing storage card), so units step down to MB/KB.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0KB"
  const GB = 1024 ** 3
  const MB = 1024 ** 2
  const KB = 1024
  if (bytes >= GB)
    return `${(bytes / GB).toLocaleString(undefined, { maximumFractionDigits: 2 })}GB`
  if (bytes >= MB)
    return `${(bytes / MB).toLocaleString(undefined, { maximumFractionDigits: 2 })}MB`
  return `${Math.round(bytes / KB)}KB`
}
