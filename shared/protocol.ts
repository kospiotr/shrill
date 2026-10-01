/**
 * Wire protocol shared by the Worker and the browser client.
 *
 * Uploads travel over GET requests with the payload in the query string, so the
 * chunk size is bounded by Cloudflare's 16 KB URL limit:
 * https://developers.cloudflare.com/workers/platform/limits/
 */

/** Raw bytes per chunk. Base64url-encoded this is ~8 KB of query string. */
export const CHUNK_SIZE = 6 * 1024

/** Hard ceiling the Worker accepts for one chunk, leaving headroom under 16 KB. */
export const MAX_CHUNK_SIZE = 11 * 1024

/** Largest file the Worker will register. */
export const MAX_FILE_SIZE = 512 * 1024 * 1024

/** Longest original filename kept in metadata. */
export const MAX_NAME_LENGTH = 255

/** Everything known about one stored file. Persisted as `uploads/<id>/meta.json`. */
export interface FileMeta {
  id: string
  name: string
  size: number
  /** MIME type, or '' when the browser did not report one. */
  type: string
  /** Bytes per chunk the Worker expects. Clients must honour this value. */
  chunkSize: number
  chunks: number
  createdAt: string
  /** True once every chunk has arrived and the upload was finalised. */
  complete: boolean
}

/** One page of the file listing, newest upload first. */
export interface FileListPage {
  files: FileMeta[]
  /** Pass back as `?cursor=` to fetch the next page, when present. */
  cursor?: string
}

/** Which chunks the Worker has, so an interrupted upload can resume. */
export interface UploadStatus {
  id: string
  chunks: number
  received: number[]
  missing: number[]
  complete: boolean
}

export interface ApiError {
  error: string
  /** Present on a failed complete: the chunks still outstanding. */
  missing?: number[]
}
