/** Format an ISO date day-first. Defaults to en-AU (the product's audience), whatever the browser says. */
export function formatDate(iso: string, locale = 'en-AU'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}
