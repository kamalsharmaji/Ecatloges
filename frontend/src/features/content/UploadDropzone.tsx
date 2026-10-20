import { CircleAlert, CircleCheck, CloudUpload, LoaderCircle } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { UploadJob } from '@/features/content/useUploader'
import { cn } from '@/utils/cn'

/** Drag-and-drop / click-to-browse file picker. Validation happens server-side; `accept` only filters the dialog. */
export function UploadDropzone({
  onFiles,
  accept,
  hint,
  disabled = false,
  compact = false,
}: {
  onFiles: (files: File[]) => void
  accept: string
  hint: string
  disabled?: boolean
  compact?: boolean
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled && e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files))
      }}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors',
        compact ? 'px-3 py-5' : 'px-4 py-8',
        over ? 'border-brand-600 bg-brand-50' : 'border-[#9cc3fa] bg-[#f5f9ff]',
        disabled && 'opacity-60',
      )}
    >
      <CloudUpload className="size-9 text-brand-700" strokeWidth={1.6} aria-hidden />
      {compact ? (
        <p className="mt-2 text-sm font-semibold">
          Drag & drop files here or{' '}
          <label htmlFor={inputId} className="cursor-pointer text-brand-700 underline underline-offset-2">
            browse
          </label>
        </p>
      ) : (
        <>
          <p className="mt-2 text-[15px] font-bold text-ink">Upload Media Files</p>
          <p className="mt-1 text-[12.5px] text-body">Drag & drop files here or click to browse</p>
        </>
      )}
      <p className="mt-1 text-xs text-body">{hint}</p>
      {!compact && (
        <label htmlFor={inputId} className="mt-3 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-brand-700 px-5 text-sm font-medium text-white shadow-pill hover:bg-brand-800">
          <CloudUpload className="size-4" aria-hidden /> Browse Files
        </label>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function UploadProgressList({ jobs }: { jobs: UploadJob[] }) {
  if (jobs.length === 0) return null
  return (
    <ul className="mt-3 space-y-2" aria-live="polite">
      {jobs.map((job) => (
        <li key={job.key} className="rounded-lg border border-border bg-white px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            {job.status === 'uploading' && <LoaderCircle className="size-3.5 animate-spin text-brand-600" aria-hidden />}
            {job.status === 'done' && <CircleCheck className="size-3.5 text-emerald-600" aria-hidden />}
            {job.status === 'error' && <CircleAlert className="size-3.5 text-red-600" aria-hidden />}
            <span className="flex-1 truncate font-medium">{job.name}</span>
            {job.status === 'uploading' && <span className="tabular-nums text-muted">{job.progress}%</span>}
          </div>
          {job.status === 'uploading' && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${job.progress}%` }} />
            </div>
          )}
          {job.error && <p className="mt-1 text-red-600">{job.error}</p>}
        </li>
      ))}
    </ul>
  )
}
