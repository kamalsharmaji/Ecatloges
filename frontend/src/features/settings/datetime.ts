const pad = (n: number) => String(n).padStart(2, '0')

/** ISO timestamp → value for <input type="datetime-local"> in the browser's timezone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> value (browser timezone) → ISO timestamp with offset (UTC). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** The browser's IANA timezone, shown next to schedule fields. */
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
