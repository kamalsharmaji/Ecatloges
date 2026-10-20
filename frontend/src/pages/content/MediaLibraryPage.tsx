import heroArt from '@/assets/reference/hero-media.webp'
import { ActionMenu } from '@/components/panel/ActionMenu'
import { Database, Download, Folder, FolderInput, Image as ImageIcon, Images, PlayCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useMedia, useMediaBulk, useMediaUsage } from '@/api/content'
import { PageHero } from '@/components/panel/PageHero'
import { PlanLimitAlert } from '@/components/panel/PlanLimitAlert'
import { StatCard, StatGrid } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { ACCEPTED_MEDIA, formatBytes, formatDate } from '@/features/content/format'
import { MediaThumb } from '@/features/content/MediaThumb'
import { UploadDropzone, UploadProgressList } from '@/features/content/UploadDropzone'
import { useUploader } from '@/features/content/useUploader'
import { RequirePermission } from '@/routes/guards'
import type { MediaAsset, MediaFolder } from '@/types/content'
import { cn } from '@/utils/cn'

function AssetDetail({ asset, onClose }: { asset: MediaAsset | null; onClose: () => void }) {
  if (!asset) return null
  return (
    <Modal open onClose={onClose} size="lg" title={asset.original_filename} description={`${asset.extension.toUpperCase()} · ${formatBytes(asset.size_bytes)}${asset.width ? ` · ${asset.width}×${asset.height}px` : ''}`}>
      <div className="space-y-4">
        {asset.kind === 'video' ? (
          <video controls preload="metadata" src={asset.original_url ?? undefined} className="max-h-[60vh] w-full rounded-lg bg-black" />
        ) : (
          <img src={asset.preview_url ?? undefined} alt={asset.alt_text || asset.original_filename} className="max-h-[60vh] w-full rounded-lg bg-canvas object-contain" />
        )}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-muted">Uploaded</dt><dd>{formatDate(asset.created_at)}</dd></div>
          <div><dt className="text-muted">Used by products</dt><dd>{asset.usage_count}</dd></div>
        </dl>
        {asset.original_url && (
          <a href={asset.original_url} download={asset.original_filename} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            <Download className="size-4" aria-hidden /> Download original
          </a>
        )}
      </div>
    </Modal>
  )
}

export function MediaLibraryPage() {
  const { businessId, can } = useActiveBusiness()
  const toast = useToast()
  const [params, setParams] = useState({ page: 1, search: '', folder: '', kind: '', ordering: '-created_at' })
  const [selected, setSelected] = useState<string[]>([])
  const [viewing, setViewing] = useState<MediaAsset | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [moveTo, setMoveTo] = useState<MediaFolder | ''>('')
  const [moving, setMoving] = useState(false)
  const list = useMedia(businessId, { ...params, page_size: 24 })
  const usage = useMediaUsage(businessId)
  const bulk = useMediaBulk()
  const uploadFolder: MediaFolder = (params.folder as MediaFolder) || 'product_images'
  const uploader = useUploader(uploadFolder)
  const lastError = uploader.jobs.find((j) => j.status === 'error')

  const set = (patch: Partial<typeof params>) => {
    setSelected([])
    setParams((p) => ({ ...p, page: 1, ...patch }))
  }

  const u = usage.data
  const usedPct = u?.limit_mb ? Math.min(100, Math.round((u.used_bytes / (u.limit_mb * 1024 * 1024)) * 100)) : null

  return (
    <RequirePermission codes={['media.view']}>
      <PageHero
        icon={Images}
        title="Media Library"
        description="Upload, manage and organise your images and videos. Use them in your products, catalogues and categories."
        illustration={heroArt}
        highlights={['Upload high-quality images & videos', 'Originals stored untouched', 'Use in products & catalogues', 'JPG, PNG, WebP, MP4, MOV']}
      />
      <StatGrid>
        <StatCard icon={Images} label="Total files" value={u?.total ?? '—'} loading={usage.isPending} />
        <StatCard icon={ImageIcon} tone="pink" label="Images" value={u?.images ?? '—'} loading={usage.isPending} />
        <StatCard icon={PlayCircle} tone="violet" label="Videos" value={u?.videos ?? '—'} loading={usage.isPending}
          hint={u && !u.video_uploads_enabled ? 'Not included in your plan' : undefined} />
        <StatCard
          icon={Database}
          label="Storage used"
          ornament={false}
          value={u ? `${formatBytes(u.used_bytes)}${u.limit_mb ? ` / ${formatBytes(u.limit_mb * 1024 * 1024)}` : ''}` : '—'}
          loading={usage.isPending}
          hint={usedPct !== null ? (
            <span className="mt-1 block h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
              <span className={cn('block h-full', usedPct >= 90 ? 'bg-amber-500' : 'bg-brand-600')} style={{ width: `${usedPct}%` }} />
            </span>
          ) : u ? 'No storage limit' : undefined}
        />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <Toolbar>
            <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search files by name…" />
            <FilterSelect label="Folder" value={params.folder} onChange={(folder) => set({ folder })}
              options={[{ value: '', label: 'All files' }, ...(u?.folders ?? []).map((f) => ({ value: f.key, label: f.label }))]} />
            <FilterSelect label="Type" value={params.kind} onChange={(kind) => set({ kind })}
              options={[{ value: '', label: 'All types' }, { value: 'image', label: 'Images' }, { value: 'video', label: 'Videos' }]} />
            <FilterSelect label="Sort" value={params.ordering} onChange={(ordering) => set({ ordering })}
              options={[{ value: '-created_at', label: 'Newest first' }, { value: 'created_at', label: 'Oldest first' }, { value: '-size_bytes', label: 'Largest first' }, { value: 'original_filename', label: 'Name A–Z' }]} />
          </Toolbar>

          {list.isPending ? (
            <Spinner label="Loading files…" />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data.results.length === 0 ? (
            <EmptyState icon={Images} title={params.search || params.folder || params.kind ? 'No files match your filters' : 'No files yet'} description="Upload product photos and videos using the panel." />
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {list.data.results.map((a) => {
                const isSel = selected.includes(a.id)
                return (
                  <li key={a.id} className={cn('relative overflow-hidden rounded-2xl bg-white shadow-panel', isSel && 'ring-2 ring-brand-600')}>
                    <button type="button" onClick={() => setViewing(a)} className="block w-full p-1.5 pb-0" aria-label={`Open ${a.original_filename}`}>
                      <MediaThumb media={a} className="h-[112px] w-full rounded-lg" />
                    </button>
                    <span className="absolute top-3 left-3 flex size-6 items-center justify-center rounded-md bg-white/95 shadow-sm">
                      <input type="checkbox" aria-label={`Select ${a.original_filename}`} checked={isSel} className="size-4 accent-brand-700"
                        onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, a.id] : cur.filter((id) => id !== a.id)))} />
                    </span>
                    <ActionMenu className="absolute top-3 right-3" items={[
                      { label: 'Open', onSelect: () => setViewing(a) },
                      { label: 'Download original', icon: Download, onSelect: () => a.original_url && window.open(a.original_url, '_blank', 'noopener'), hidden: !a.original_url },
                    ]} />
                    <div className="flex items-center gap-2.5 px-3 py-3">
                      <span className={cn('rounded-md px-1.5 py-1 text-[11px] font-bold uppercase', a.kind === 'video' ? 'bg-[#ffe1e8] text-[#e11d48]' : a.extension === 'png' ? 'bg-[#ffe4ef] text-[#d6336c]' : 'bg-[#e0ebff] text-[#1f5fe0]')}>{a.extension}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">{a.original_filename}</span>
                        <span className="block text-[11.5px] text-body">{formatBytes(a.size_bytes)} • {formatDate(a.created_at)}</span>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-panel">
            <span className="text-ink">{selected.length} files selected</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {can('media.upload') && <Button variant="secondary" size="sm" icon={<FolderInput className="size-4" />} disabled={!selected.length} onClick={() => setMoving(true)}>Move to folder</Button>}
              {can('media.delete') && <Button variant="secondary" size="sm" icon={<Trash2 className="size-4" />} disabled={!selected.length} onClick={() => setConfirmDelete(true)}>Delete</Button>}
            </div>
            {list.data && <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} onPage={(page) => { setSelected([]); setParams((p) => ({ ...p, page })) }} />}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          {can('media.upload') && (
            <div className="rounded-2xl bg-white p-4 shadow-panel">
              <h2 className="sr-only">Upload media files</h2>
              <UploadDropzone
                accept={ACCEPTED_MEDIA}
                hint={`JPG, PNG, WebP${u?.video_uploads_enabled ? ', MP4, MOV' : ''} · max ${u?.max_upload_mb ?? 100} MB`}
                disabled={uploader.busy}
                onFiles={async (files) => {
                  const done = await uploader.upload(files)
                  if (done.length) toast.show(`${done.length} file(s) uploaded to ${u?.folders.find((f) => f.key === uploadFolder)?.label ?? 'library'}.`)
                }}
              />
              <p className="mt-2 text-xs text-muted">Files go to the folder selected in the filter (default: Product images).</p>
              <UploadProgressList jobs={uploader.jobs} />
              <PlanLimitAlert className="mt-3" error={lastError?.cause} />
            </div>
          )}
          <div className="rounded-2xl bg-white p-4 shadow-panel">
            <h2 className="mb-2 text-[15px] font-bold text-ink">Folders</h2>
            <ul className="space-y-1">
              <li>
                <button type="button" onClick={() => set({ folder: '' })} className={cn('flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[14px] text-ink', !params.folder ? 'bg-[#eaf2fe]' : 'hover:bg-canvas')}>
                  <Folder className="size-5 fill-brand-600 text-brand-600" aria-hidden /> <span className="flex-1 text-left">All Files</span> <span className="text-[13px] tabular-nums">{u?.total ?? ''}</span>
                </button>
              </li>
              {(u?.folders ?? []).map((f) => (
                <li key={f.key}>
                  <button type="button" onClick={() => set({ folder: f.key })} className={cn('flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[14px] text-ink', params.folder === f.key ? 'bg-[#eaf2fe]' : 'hover:bg-canvas')}>
                    <Folder className="size-5 fill-amber-400 text-amber-500" aria-hidden /> <span className="flex-1 text-left">{f.label}</span> <span className="text-[13px] tabular-nums">{f.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <AssetDetail asset={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        loading={bulk.isPending}
        title={`Delete ${selected.length} file(s)?`}
        description="Originals and previews are removed permanently. Files still used by a product, catalogue or category are skipped."
        confirmLabel="Delete files"
        onConfirm={() =>
          bulk.mutate({ ids: selected, action: 'delete' }, {
            onSuccess: (r) => {
              setConfirmDelete(false)
              setSelected([])
              toast.show(`${r.deleted ?? 0} deleted${r.skipped_in_use?.length ? `, ${r.skipped_in_use.length} skipped (in use)` : ''}.`, r.skipped_in_use?.length ? 'info' : 'success')
            },
            onError: (e) => { setConfirmDelete(false); toast.show(e.message, 'error') },
          })
        }
      />
      <Modal open={moving} onClose={() => setMoving(false)} title={`Move ${selected.length} file(s)`}
        footer={<>
          <Button variant="secondary" onClick={() => setMoving(false)}>Cancel</Button>
          <Button disabled={!moveTo} loading={bulk.isPending} onClick={() => moveTo && bulk.mutate({ ids: selected, action: 'move', folder: moveTo }, {
            onSuccess: () => { setMoving(false); setSelected([]); toast.show('Files moved.') },
            onError: (e) => toast.show(e.message, 'error'),
          })}>Move</Button>
        </>}>
        <FilterSelect label="Folder" value={moveTo} onChange={(v) => setMoveTo(v as MediaFolder)}
          options={[{ value: '', label: 'Choose a folder' }, ...(u?.folders ?? []).map((f) => ({ value: f.key, label: f.label }))]} />
      </Modal>
    </RequirePermission>
  )
}
