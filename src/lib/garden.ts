/**
 * Browser half of the wire protocol: slice a file, send each slice as its own
 * GET, then finish. Deliberately free of Vue so the views stay presentational.
 */

import { encodeBase64Url } from '@shared/base64url'
import type { ApiError, FileListPage, FileMeta, UploadStatus } from '@shared/protocol'

/** Requests in flight at once while planting. */
const CONCURRENCY = 6

/** Attempts per seed before giving up. */
const ATTEMPTS = 3

export interface PlantProgress {
  /** Seeds confirmed sown. */
  sown: number
  total: number
  bytes: number
  size: number
  /** 0..1, derived from seed counts so an empty planting reports 1. */
  fraction: number
}

export interface PlantOptions {
  onMeta?: (meta: FileMeta) => void
  onProgress?: (progress: PlantProgress) => void
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

export function fetchGrowth(id: string, signal?: AbortSignal): Promise<UploadStatus> {
  return apiGet<UploadStatus>(`/api/garden/growth?id=${encodeURIComponent(id)}`, signal)
}

export function fetchGarden(cursor?: string, signal?: AbortSignal): Promise<FileListPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiGet<FileListPage>(`/api/garden${query}`, signal)
}

export function harvestUrl(id: string): string {
  return `/api/harvest/${encodeURIComponent(id)}`
}

/** A link that harvests the planting directly — there is no separate page for it. */
export function harvestLink(id: string): string {
  return new URL(harvestUrl(id), window.location.origin).toString()
}

export async function uproot(id: string): Promise<void> {
  await fetch(`/api/garden/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Sow one seed, retrying transient failures with a short backoff. */
async function sowSeed(
  id: string,
  index: number,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  const data = encodeBase64Url(bytes)
  const path = `/api/garden/seed?id=${encodeURIComponent(id)}&index=${index}&data=${data}`

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
 * Plant `file` seed by seed. Resolves with the finished metadata, whose `id`
 * is what's needed to harvest it later.
 */
export async function plantFile(file: File, options: PlantOptions = {}): Promise<FileMeta> {
  const { onMeta, onProgress, signal } = options

  const query = new URLSearchParams({
    name: file.name,
    size: String(file.size),
    type: file.type,
  })
  const meta = await apiGet<FileMeta>(`/api/garden/sow?${query}`, signal)
  onMeta?.(meta)

  let sown = 0
  let bytes = 0

  const report = () => {
    onProgress?.({
      sown,
      total: meta.chunks,
      bytes,
      size: meta.size,
      fraction: meta.chunks === 0 ? 1 : sown / meta.chunks,
    })
  }
  report()

  // A shared cursor lets the workers pull the next seed as soon as they are
  // free, rather than advancing in lockstep batches.
  let next = 0

  const worker = async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= meta.chunks) return
      if (signal?.aborted) throw new DOMException('Planting aborted', 'AbortError')

      const start = index * meta.chunkSize
      const slice = file.slice(start, Math.min(start + meta.chunkSize, file.size))
      const chunk = new Uint8Array(await slice.arrayBuffer())

      await sowSeed(meta.id, index, chunk, signal)
      sown += 1
      bytes += chunk.byteLength
      report()
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, meta.chunks) }, worker))

  return apiGet<FileMeta>(`/api/garden/ripen?id=${encodeURIComponent(meta.id)}`, signal)
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
