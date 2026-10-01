/**
 * Browser half of the transfer protocol: slice a file, ship each slice as a GET,
 * then finalise. Deliberately free of Vue so the views stay presentational.
 */

import { encodeBase64Url } from '@shared/base64url'
import type { ApiError, FileListPage, FileMeta, UploadStatus } from '@shared/protocol'

/** Chunk requests in flight at once. */
const CONCURRENCY = 6

/** Attempts per chunk before the upload gives up. */
const ATTEMPTS = 3

export interface UploadProgress {
  /** Chunks confirmed stored. */
  uploaded: number
  total: number
  bytes: number
  size: number
  /** 0..1, derived from chunk counts so an empty file reports 1. */
  fraction: number
}

export interface UploadOptions {
  onMeta?: (meta: FileMeta) => void
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | ApiError | null
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? body.error : null
    throw new Error(message || `Request failed with ${response.status}`)
  }
  return body as T
}

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return readJson<T>(await fetch(path, { signal }))
}

export function fetchStatus(id: string, signal?: AbortSignal): Promise<UploadStatus> {
  return apiGet<UploadStatus>(`/api/upload/status?id=${encodeURIComponent(id)}`, signal)
}

export function fetchFiles(cursor?: string, signal?: AbortSignal): Promise<FileListPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiGet<FileListPage>(`/api/files${query}`, signal)
}

export function downloadUrl(id: string): string {
  return `/api/download/${encodeURIComponent(id)}`
}

/** A link that downloads the file directly — there is no standalone download page. */
export function shareUrl(id: string): string {
  return new URL(downloadUrl(id), window.location.origin).toString()
}

export async function discardUpload(id: string): Promise<void> {
  await fetch(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Send one chunk, retrying transient failures with a short backoff. */
async function sendChunk(
  id: string,
  index: number,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  const data = encodeBase64Url(bytes)
  const path = `/api/upload/chunk?id=${encodeURIComponent(id)}&index=${index}&data=${data}`

  for (let attempt = 1; ; attempt += 1) {
    try {
      await apiGet(path, signal)
      return
    } catch (error) {
      if (signal?.aborted || attempt >= ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
    }
  }
}

/**
 * Upload `file` in chunks. Resolves with the finalised metadata, whose `id` is
 * what a recipient needs to download the file.
 */
export async function uploadFile(file: File, options: UploadOptions = {}): Promise<FileMeta> {
  const { onMeta, onProgress, signal } = options

  const query = new URLSearchParams({
    name: file.name,
    size: String(file.size),
    type: file.type,
  })
  const meta = await apiGet<FileMeta>(`/api/upload/init?${query}`, signal)
  onMeta?.(meta)

  let uploaded = 0
  let bytes = 0

  const report = () => {
    onProgress?.({
      uploaded,
      total: meta.chunks,
      bytes,
      size: meta.size,
      fraction: meta.chunks === 0 ? 1 : uploaded / meta.chunks,
    })
  }
  report()

  // A shared cursor lets the workers pull the next chunk as soon as they are
  // free, rather than advancing in lockstep batches.
  let next = 0

  const worker = async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= meta.chunks) return
      if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError')

      const start = index * meta.chunkSize
      const slice = file.slice(start, Math.min(start + meta.chunkSize, file.size))
      const chunk = new Uint8Array(await slice.arrayBuffer())

      await sendChunk(meta.id, index, chunk, signal)
      uploaded += 1
      bytes += chunk.byteLength
      report()
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, meta.chunks) }, worker))

  return apiGet<FileMeta>(`/api/upload/complete?id=${encodeURIComponent(meta.id)}`, signal)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
