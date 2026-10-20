import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { uploadMedia } from '@/api/content'
import { ApiError } from '@/api/client'
import type { MediaAsset, MediaFolder } from '@/types/content'

export interface UploadJob {
  key: string
  name: string
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
  /** The original error, so callers can react to plan limits (HTTP 402). */
  cause?: unknown
  asset?: MediaAsset
}

/** Uploads files one by one with progress; failures don't stop the rest of the batch. */
export function useUploader(folder: MediaFolder) {
  const qc = useQueryClient()
  const [jobs, setJobs] = useState<UploadJob[]>([])

  const update = (key: string, patch: Partial<UploadJob>) => setJobs((all) => all.map((j) => (j.key === key ? { ...j, ...patch } : j)))

  const upload = useCallback(
    async (files: File[] | FileList, overrideFolder?: MediaFolder): Promise<MediaAsset[]> => {
      const list = Array.from(files)
      const batch = list.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, progress: 0, status: 'uploading' as const }))
      setJobs((all) => [...all.filter((j) => j.status === 'uploading'), ...batch])
      const done: MediaAsset[] = []
      for (const [i, file] of list.entries()) {
        const { key } = batch[i]
        try {
          const asset = await uploadMedia(file, overrideFolder ?? folder, (progress) => update(key, { progress }))
          update(key, { status: 'done', progress: 100, asset })
          done.push(asset)
        } catch (error) {
          update(key, { status: 'error', error: error instanceof ApiError ? error.message : 'Upload failed.', cause: error })
        }
      }
      await qc.invalidateQueries({ queryKey: ['media'] })
      return done
    },
    [folder, qc],
  )

  const clear = useCallback(() => setJobs((all) => all.filter((j) => j.status === 'uploading')), [])
  return { jobs, upload, clear, busy: jobs.some((j) => j.status === 'uploading') }
}
