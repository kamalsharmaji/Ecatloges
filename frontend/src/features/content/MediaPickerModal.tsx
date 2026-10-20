import { Check } from 'lucide-react'
import { useState } from 'react'
import { useMedia } from '@/api/content'
import { Button } from '@/components/ui/Button'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/panel/Toolbar'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { ACCEPTED_IMAGES, ACCEPTED_MEDIA } from '@/features/content/format'
import { MediaThumb } from '@/features/content/MediaThumb'
import { UploadDropzone, UploadProgressList } from '@/features/content/UploadDropzone'
import { useUploader } from '@/features/content/useUploader'
import type { MediaAsset, MediaFolder, MediaKind } from '@/types/content'
import { cn } from '@/utils/cn'

/** "Add from Media Library": pick existing files or upload new ones without leaving the form. */
export function MediaPickerModal({
  open,
  onClose,
  onPick,
  multiple = true,
  kind,
  folder = 'product_images',
  exclude = [],
  title = 'Media library',
}: {
  open: boolean
  onClose: () => void
  onPick: (assets: MediaAsset[]) => void
  multiple?: boolean
  kind?: MediaKind
  folder?: MediaFolder
  exclude?: string[]
  title?: string
}) {
  const { businessId, can } = useActiveBusiness()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MediaAsset[]>([])
  const media = useMedia(businessId, { page, search, kind, page_size: 24 }, open)
  const uploader = useUploader(folder)

  const toggle = (asset: MediaAsset) => {
    setSelected((cur) => {
      const has = cur.some((a) => a.id === asset.id)
      if (!multiple) return has ? [] : [asset]
      return has ? cur.filter((a) => a.id !== asset.id) : [...cur, asset]
    })
  }
  const close = () => {
    setSelected([])
    uploader.clear()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={title}
      description={multiple ? 'Select one or more files, or upload new ones.' : 'Select a file, or upload a new one.'}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={selected.length === 0}
            onClick={() => {
              onPick(selected)
              close()
            }}
          >
            {multiple ? `Add ${selected.length || ''} selected` : 'Use selected'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {can('media.upload') && (
          <>
            <UploadDropzone
              compact
              accept={kind === 'image' ? ACCEPTED_IMAGES : ACCEPTED_MEDIA}
              hint={kind === 'image' ? 'JPG, PNG or WebP' : 'JPG, PNG, WebP, MP4 or MOV'}
              disabled={uploader.busy}
              onFiles={async (files) => {
                const added = await uploader.upload(files)
                const usable = added.filter((a) => !kind || a.kind === kind)
                setSelected((cur) => (multiple ? [...cur, ...usable] : usable.slice(-1)))
              }}
            />
            <UploadProgressList jobs={uploader.jobs} />
          </>
        )}
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search files by name" className="sm:w-full" />
        {media.isPending ? (
          <Spinner />
        ) : media.isError ? (
          <ErrorState error={media.error} onRetry={() => media.refetch()} />
        ) : media.data.results.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No files yet. Upload some above.</p>
        ) : (
          <>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {media.data.results.map((asset) => {
                const isSelected = selected.some((a) => a.id === asset.id)
                const disabled = exclude.includes(asset.id)
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={isSelected}
                      onClick={() => toggle(asset)}
                      className={cn(
                        'relative block w-full overflow-hidden rounded-lg ring-2 ring-offset-2 transition disabled:cursor-not-allowed disabled:opacity-40',
                        isSelected ? 'ring-brand-600' : 'ring-transparent hover:ring-brand-200',
                      )}
                    >
                      <MediaThumb media={asset} className="aspect-square w-full" />
                      {isSelected && (
                        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-brand-700 text-white">
                          <Check className="size-3.5" aria-hidden />
                        </span>
                      )}
                      <span className="block truncate px-1 py-1 text-left text-xs">{asset.original_filename}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <Pagination page={page} totalPages={media.data.total_pages} count={media.data.count} pageSize={media.data.page_size} noun="files" onPage={setPage} />
          </>
        )}
      </div>
    </Modal>
  )
}
