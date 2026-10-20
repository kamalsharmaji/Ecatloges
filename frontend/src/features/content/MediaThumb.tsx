import { Image as ImageIcon, Play } from 'lucide-react'
import { formatDuration } from '@/features/content/format'
import type { MediaBrief } from '@/types/content'
import { cn } from '@/utils/cn'

/** Small preview: uses the thumbnail rendition, never the full-resolution original. */
export function MediaThumb({ media, className, alt = '' }: { media: MediaBrief | null | undefined; className?: string; alt?: string }) {
  if (!media) {
    return (
      <div className={cn('flex items-center justify-center bg-slate-100 text-slate-400', className)}>
        <ImageIcon className="size-1/3 max-h-8 max-w-8" aria-hidden />
      </div>
    )
  }
  if (media.kind === 'video') {
    const duration = formatDuration(media.duration_seconds)
    return (
      <div className={cn('relative flex items-center justify-center bg-slate-800 text-white', className)}>
        {media.thumbnail_url && <img src={media.thumbnail_url} alt={alt} className="absolute inset-0 size-full object-cover opacity-80" loading="lazy" />}
        <span className="relative flex size-9 items-center justify-center rounded-full bg-white/90 text-slate-900">
          <Play className="size-4 fill-current" aria-hidden />
        </span>
        {duration && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-[10px] font-medium">{duration}</span>}
      </div>
    )
  }
  return <img src={media.thumbnail_url ?? undefined} alt={alt || media.alt_text || media.title} loading="lazy" className={cn('object-cover', className)} />
}
