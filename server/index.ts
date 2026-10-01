/**
 * Shrill: chunked file transfer where every upload request is a plain GET with
 * the payload in the query string. Chunks are stored in R2 and streamed back
 * in order on download.
 *
 *   GET    /api/upload/init?name&size&type   -> FileMeta (registers an upload)
 *   GET    /api/upload/chunk?id&index&data   -> { id, index, bytes }
 *   GET    /api/upload/status?id             -> UploadStatus
 *   GET    /api/upload/complete?id           -> FileMeta (finalises)
 *   GET    /api/files                        -> FileListPage (completed uploads, newest first)
 *   GET    /api/files/:id                    -> FileMeta
 *   DELETE /api/files/:id                    -> 204
 *   GET    /api/download/:id                 -> the file
 */

import { BASE64URL_PATTERN, decodeBase64Url } from '../shared/base64url'
import {
  CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MAX_FILE_SIZE,
  MAX_NAME_LENGTH,
  type FileMeta,
  type UploadStatus,
} from '../shared/protocol'
import {
  deleteUpload,
  isValidId,
  listReceived,
  listUploads,
  putPart,
  readMeta,
  streamFile,
  writeMeta,
} from './storage'

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function fail(message: string, status: number, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...extra }, status)
}

/** Characters that could break out of a storage key or a header value. */
const UNSAFE_NAME_CHARS = new RegExp('[\\u0000-\\u001f\\u007f"\\\\/]', 'g')
const NON_ASCII = new RegExp('[^\\u0020-\\u007e]', 'g')

function sanitizeName(name: string): string {
  const cleaned = name.replace(UNSAFE_NAME_CHARS, '_').trim().slice(0, MAX_NAME_LENGTH)
  return cleaned || 'download'
}

/** Keep only well-formed MIME types; anything else is served as a generic blob. */
function sanitizeType(type: string): string {
  return /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : ''
}

function contentDisposition(name: string): string {
  const ascii = name.replace(NON_ASCII, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** Resolve the upload named by an id, or the error response explaining why not. */
async function requireMeta(
  bucket: R2Bucket,
  id: string | null,
): Promise<{ meta: FileMeta } | { response: Response }> {
  if (!id || !isValidId(id)) {
    return { response: fail('A valid upload id is required', 400) }
  }
  const meta = await readMeta(bucket, id)
  if (!meta) {
    return { response: fail('Upload not found', 404) }
  }
  return { meta }
}

async function handleInit(url: URL, bucket: R2Bucket): Promise<Response> {
  const size = Number(url.searchParams.get('size'))
  if (!Number.isInteger(size) || size < 0) {
    return fail('size must be a non-negative integer', 400)
  }
  if (size > MAX_FILE_SIZE) {
    return fail(`File is larger than the ${MAX_FILE_SIZE} byte limit`, 413)
  }

  const meta: FileMeta = {
    id: crypto.randomUUID(),
    name: sanitizeName(url.searchParams.get('name') ?? ''),
    size,
    type: sanitizeType(url.searchParams.get('type') ?? ''),
    chunkSize: CHUNK_SIZE,
    chunks: Math.ceil(size / CHUNK_SIZE),
    createdAt: new Date().toISOString(),
    complete: size === 0,
  }

  await writeMeta(bucket, meta)
  return json(meta, 201)
}

async function handleChunk(url: URL, bucket: R2Bucket): Promise<Response> {
  const found = await requireMeta(bucket, url.searchParams.get('id'))
  if ('response' in found) return found.response
  const { meta } = found

  if (meta.complete) {
    return fail('Upload has already been completed', 409)
  }

  const index = Number(url.searchParams.get('index'))
  if (!Number.isInteger(index) || index < 0 || index >= meta.chunks) {
    return fail(`index must be between 0 and ${meta.chunks - 1}`, 400)
  }

  const data = url.searchParams.get('data')
  if (data === null) {
    return fail('data is required', 400)
  }
  if (!BASE64URL_PATTERN.test(data)) {
    return fail('data must be base64url encoded', 400)
  }

  let bytes: Uint8Array
  try {
    bytes = decodeBase64Url(data)
  } catch {
    return fail('data is not valid base64url', 400)
  }
  if (bytes.byteLength > MAX_CHUNK_SIZE) {
    return fail(`A chunk may not exceed ${MAX_CHUNK_SIZE} bytes`, 413)
  }

  await putPart(bucket, meta.id, index, bytes)
  return json({ id: meta.id, index, bytes: bytes.byteLength })
}

async function handleStatus(url: URL, bucket: R2Bucket): Promise<Response> {
  const found = await requireMeta(bucket, url.searchParams.get('id'))
  if ('response' in found) return found.response
  const { meta } = found

  const received = await listReceived(bucket, meta.id)
  const have = new Set(received)
  const missing: number[] = []
  for (let index = 0; index < meta.chunks; index += 1) {
    if (!have.has(index)) missing.push(index)
  }

  const status: UploadStatus = {
    id: meta.id,
    chunks: meta.chunks,
    received,
    missing,
    complete: meta.complete,
  }
  return json(status)
}

async function handleComplete(url: URL, bucket: R2Bucket): Promise<Response> {
  const found = await requireMeta(bucket, url.searchParams.get('id'))
  if ('response' in found) return found.response
  const { meta } = found

  if (meta.complete) {
    return json(meta)
  }

  const received = await listReceived(bucket, meta.id)
  if (received.length !== meta.chunks) {
    const have = new Set(received)
    const missing: number[] = []
    for (let index = 0; index < meta.chunks && missing.length < 100; index += 1) {
      if (!have.has(index)) missing.push(index)
    }
    return fail(`Upload is missing ${meta.chunks - received.length} chunk(s)`, 409, { missing })
  }

  const completed: FileMeta = { ...meta, complete: true }
  await writeMeta(bucket, completed)
  return json(completed)
}

async function handleList(url: URL, bucket: R2Bucket): Promise<Response> {
  const cursor = url.searchParams.get('cursor') ?? undefined
  const page = await listUploads(bucket, { cursor })
  return json(page)
}

async function handleDownload(id: string, bucket: R2Bucket): Promise<Response> {
  const found = await requireMeta(bucket, id)
  if ('response' in found) return found.response
  const { meta } = found

  if (!meta.complete) {
    return fail('Upload is still in progress', 409)
  }

  // Content-Length is not set here: the runtime derives it from the body, which
  // streamFile makes a fixed-length stream.
  const headers = {
    'Content-Type': meta.type || 'application/octet-stream',
    'Content-Disposition': contentDisposition(meta.name),
    // Content at a given id never changes, but the id itself is the capability.
    'Cache-Control': 'private, max-age=3600',
  }

  if (meta.size === 0) {
    return new Response(null, { headers })
  }
  return new Response(streamFile(bucket, meta), { headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const { pathname } = url

    // Anything that is not the API belongs to the SPA. Deferring to the assets
    // binding is what makes client-side routes such as /d/<id> resolve, since a
    // configured Worker takes precedence over `not_found_handling`.
    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }

    const bucket = env.UPLOADS
    const fileId = pathname.match(/^\/api\/(?:files|download)\/([^/]+)$/)?.[1] ?? null

    if (request.method === 'GET') {
      switch (pathname) {
        case '/api/upload/init':
          return handleInit(url, bucket)
        case '/api/upload/chunk':
          return handleChunk(url, bucket)
        case '/api/upload/status':
          return handleStatus(url, bucket)
        case '/api/upload/complete':
          return handleComplete(url, bucket)
        case '/api/files':
          return handleList(url, bucket)
      }

      if (fileId !== null && pathname.startsWith('/api/files/')) {
        const found = await requireMeta(bucket, fileId)
        return 'response' in found ? found.response : json(found.meta)
      }
      if (fileId !== null && pathname.startsWith('/api/download/')) {
        return handleDownload(fileId, bucket)
      }
    }

    if (request.method === 'DELETE' && fileId !== null && pathname.startsWith('/api/files/')) {
      if (!isValidId(fileId)) {
        return fail('A valid upload id is required', 400)
      }
      await deleteUpload(bucket, fileId)
      return new Response(null, { status: 204 })
    }

    return fail('Not found', 404)
  },
} satisfies ExportedHandler<Env>
