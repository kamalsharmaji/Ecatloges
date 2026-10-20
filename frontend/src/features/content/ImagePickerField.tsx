import { ImagePlus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { MediaPickerModal } from '@/features/content/MediaPickerModal'
import { MediaThumb } from '@/features/content/MediaThumb'
import type { MediaBrief, MediaFolder } from '@/types/content'
import { cn } from '@/utils/cn'

/** Single image chosen from (or uploaded to) the media library. */
export function ImagePickerField({
  label,
  value,
  onChange,
  folder,
  aspect = 'aspect-video',
  disabled = false,
  hint,
}: {
  label: string
  value: MediaBrief | null
  onChange: (media: MediaBrief | null) => void
  folder: MediaFolder
  aspect?: string
  disabled?: boolean
  hint?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className={cn('relative overflow-hidden rounded-xl border border-border bg-canvas', aspect)}>
        {value ? (
          <MediaThumb media={value} className="size-full" />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="flex size-full flex-col items-center justify-center gap-1 text-sm text-muted hover:text-brand-700 disabled:cursor-not-allowed"
          >
            <ImagePlus className="size-6" aria-hidden /> Choose image
          </button>
        )}
        {value && !disabled && (
          <div className="absolute top-2 right-2 flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Change</Button>
            <Button size="sm" variant="secondary" aria-label={`Remove ${label}`} icon={<X className="size-4" />} onClick={() => onChange(null)} />
          </div>
        )}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <MediaPickerModal
        open={open}
        onClose={() => setOpen(false)}
        multiple={false}
        kind="image"
        folder={folder}
        title={`Choose ${label.toLowerCase()}`}
        onPick={(assets) => assets[0] && onChange(assets[0])}
      />
    </div>
  )
}
