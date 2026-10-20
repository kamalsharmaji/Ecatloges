// Reference date style: "20 Oct 2026", "18 Oct 2026, 10:24 AM", "1 Oct". Built from parts so that every
// month uses its three-letter form (some en-GB data spells September "Sept").
const month = new Intl.DateTimeFormat('en-US', { month: 'short' })
const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

/** "20 Oct 2026" */
export const dayMonthYear = (d: Date) => `${d.getDate()} ${month.format(d)} ${d.getFullYear()}`
/** "20 Oct" */
export const dayMonth = (d: Date) => `${d.getDate()} ${month.format(d)}`
/** "20 Oct 2026, 10:24 AM" */
export const dayMonthYearTime = (d: Date) => `${dayMonthYear(d)}, ${time.format(d)}`
