/** Format an ISO date using the browser locale, defaulting to en-AU. */
export function formatDate(iso: string, locale?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const loc = locale ?? (typeof navigator !== 'undefined' && navigator.language) ?? 'en-AU'
  return d.toLocaleDateString(loc || 'en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
