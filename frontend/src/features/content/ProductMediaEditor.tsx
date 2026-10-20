import { GripVertical, ImagePlus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ACCEPTED_MEDIA } from '@/features/content/format'
import { MediaPickerModal } from '@/features/content/MediaPickerModal'
import { MediaThumb } from '@/features/content/MediaThumb'
import { UploadDropzone, UploadProgressList } from '@/features/content/UploadDropzone'
import { useDragReorder } from '@/features/content/useDragReorder'
import { useUploader } from '@/features/content/useUploader'
import type { MediaBrief } from '@/types/content'
import { cn } from '@/utils/cn'

/** Product images & videos: upload, pick from library, drag to reorder; the first item is the main image. */
export function ProductMediaEditor({
  value,
  onChange,
  max,
  canUpload,
  disabled = false,
}: {
  value: MediaBrief[]
  onChange: (media: MediaBrief[]) => void
  max: number
  canUpload: boolean
  disabled?: boolean
}) {
  const [picking, setPicking] = useState(false)
  const uploader = useUploader('product_images')
  const drag = useDragReorder(value, onChange)
  const room = max - value.length

  const addAssets = (assets: MediaBrief[]) => {
    const fresh = assets.filter((a) => !value.some((v) => v.id === a.id)).slice(0, Math.max(room, 0))
    if (fresh.length) onChange([...value, ...fresh])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Drag to reorder. The first item is the main image.</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<ImagePlus className="size-4" />} disabled={disabled || room <= 0} onClick={() => setPicking(true)}>
            Add from Media Library
          </Button>
          <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800">{value.length}/{max} files</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        {canUpload && (
          <div>
            <UploadDropzone
              compact
              accept={ACCEPTED_MEDIA}
              hint="JPG, PNG, WebP, MP4, MOV"
              disabled={disabled || uploader.busy || room <= 0}
              onFiles={async (files) => addAssets(await uploader.upload(files.slice(0, Math.max(room, 0))))}
            />
            <UploadProgressList jobs={uploader.jobs} />
          </div>
        )}
        {value.length === 0 ? (
          <p className="flex items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No images or videos yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {value.map((media, index) => (
              <li
                key={media.id}
                {...(disabled ? {} : drag.itemProps(index))}
                className={cn(
                  'group relative overflow-hidden rounded-xl ring-2 transition',
                  index === 0 ? 'ring-brand-600' : 'ring-transparent',
                  drag.overIndex === index && drag.dragIndex !== index && 'ring-brand-300',
                  drag.dragIndex === index && 'opacity-50',
                )}
              >
                <MediaThumb media={media} className="aspect-square w-full" />
                {index === 0 && <span className="absolute bottom-1.5 left-1.5 rounded bg-brand-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">Main</span>}
                {!disabled && (
                  <>
                    <span className="absolute top-1.5 left-1.5 rounded bg-white/90 p-0.5 text-muted" aria-hidden><GripVertical className="size-3.5" /></span>
                    <button type="button" aria-label="Remove from product" onClick={() => onChange(value.filter((m) => m.id !== media.id))}
                      className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 text-slate-700 shadow hover:text-red-600">
                      <X className="size-3.5" />
                    </button>
                    {index > 0 && (
                      <button type="button" onClick={() => drag.move(index, 0)}
                        className="absolute right-1.5 bottom-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium opacity-0 shadow group-hover:opacity-100 focus:opacity-100">
                        Set as main
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <MediaPickerModal open={picking} onClose={() => setPicking(false)} onPick={addAssets} exclude={value.map((v) => v.id)} title="Add from media library" />
    </div>
  )
}
