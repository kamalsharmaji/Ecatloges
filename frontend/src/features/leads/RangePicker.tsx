import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { presetRange, type DateRange } from '@/features/leads/dateRange'

export function RangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [preset, setPreset] = useState('30')
  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-[#d5e5fa] bg-white px-3 py-0.5">
      <CalendarDays className="size-[18px] text-brand-700" aria-hidden />
      <select
        aria-label="Date range"
        value={preset}
        onChange={(e) => {
          setPreset(e.target.value)
          if (e.target.value !== 'custom') onChange(presetRange(e.target.value))
        }}
        className="h-9 rounded-lg border-0 bg-transparent text-sm font-medium focus:ring-0"
      >
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="month">This month</option>
        <option value="custom">Custom range</option>
      </select>
      {preset === 'custom' && (
        <>
          <input type="date" aria-label="From" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} className="h-9 rounded-lg border border-border px-2 text-sm" />
          <span className="text-muted">–</span>
          <input type="date" aria-label="To" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} className="h-9 rounded-lg border border-border px-2 text-sm" />
        </>
      )}
    </div>
  )
}
