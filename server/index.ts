/**
 * Greenhouse: things move through plain GET requests, split into seeds that
 * are sown one at a time and stored in R2, then streamed back in order on
 * harvest.
 *
 *   GET    /api/garden/sow?name&size&type    -> FileMeta (starts a planting)
 *   GET    /api/garden/seed?id&index&data    -> { id, index, bytes }
 *   GET    /api/garden/growth?id             -> UploadStatus
 *   GET    /api/garden/ripen?id              -> FileMeta (finishes a planting)
 *   GET    /api/garden                       -> FileListPage (finished plantings, newest first)
 *   GET    /api/garden/:id                   -> FileMeta
 *   DELETE /api/garden/:id                   -> 204
 *   GET    /api/harvest/:id                  -> the planting
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
  isValidId,
  listGarden,
  listSown,
  putSeed,
  readMeta,
  streamHarvest,
  uprootPlanting,
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
  return cleaned || 'harvest'
}

/** Keep only well-formed MIME types; anything else is served as a generic blob. */
function sanitizeType(type: string): string {
  return /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : ''
}

function contentDisposition(name: string): string {
  const ascii = name.replace(NON_ASCII, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** Resolve the planting named by an id, or the error response explaining why not. */
async function requireMeta(
  bucket: R2Bucket,
  id: string | null,
): Promise<{ meta: FileMeta } | { response: Response }> {
  if (!id || !isValidId(id)) {
    return { response: fail('A valid tag is required', 400) }
  }
  const meta = await readMeta(bucket, id)
  if (!meta) {
    return { response: fail('Nothing grows under that tag', 404) }
  }
  return { meta }
}

async function handleSow(url: URL, bucket: R2Bucket): Promise<Response> {
  const size = Number(url.searchParams.get('size'))
  if (!Number.isInteger(size) || size < 0) {
    return fail('size must be a non-negative integer', 400)
  }
  if (size > MAX_FILE_SIZE) {
    return fail(`That's larger than the ${MAX_FILE_SIZE} byte limit`, 413)
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

async function handleSeed(url: URL, bucket: R2Bucket): Promise<Response> {
  const found = await requireMeta(bucket, url.searchParams.get('id'))
  if ('response' in found) return found.response
  const { meta } = found

  if (meta.complete) {
    return fail('That planting has already finished', 409)
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
    return fail(`A seed may not exceed ${MAX_CHUNK_SIZE} bytes`, 413)
  }

  await putSeed(bucket, meta.id, index, bytes)
  return json({ id: meta.id, index, bytes: bytes.byteLength })
}

async function handleGrowth(url: URL, bucket: R2Bucket): Promise<Response> {
  const found = await requireMeta(bucket, url.searchParams.get('id'))
  if ('response' in found) return found.response
  const { meta } = found

  const received = await listSown(bucket, meta.id)
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

async function handleRipen(url: URL, bucket: R2Bucket): Promise<Response> {
  const found = await requireMeta(bucket, url.searchParams.get('id'))
  if ('response' in found) return found.response
  const { meta } = found

  if (meta.complete) {
    return json(meta)
  }

  const received = await listSown(bucket, meta.id)
  if (received.length !== meta.chunks) {
    const have = new Set(received)
    const missing: number[] = []
    for (let index = 0; index < meta.chunks && missing.length < 100; index += 1) {
      if (!have.has(index)) missing.push(index)
    }
    return fail(`Still waiting on ${meta.chunks - received.length} row(s)`, 409, { missing })
  }

  const completed: FileMeta = { ...meta, complete: true }
  await writeMeta(bucket, completed)
  return json(completed)
}

async function handleGardenList(url: URL, bucket: R2Bucket): Promise<Response> {
  const cursor = url.searchParams.get('cursor') ?? undefined
  const page = await listGarden(bucket, { cursor })
  return json(page)
}

async function handleHarvest(id: string, bucket: R2Bucket): Promise<Response> {
  const found = await requireMeta(bucket, id)
  if ('response' in found) return found.response
  const { meta } = found

  if (!meta.complete) {
    return fail('Still growing', 409)
  }

  // Content-Length is not set here: the runtime derives it from the body, which
  // streamHarvest makes a fixed-length stream.
  const headers = {
    'Content-Type': meta.type || 'application/octet-stream',
    'Content-Disposition': contentDisposition(meta.name),
    // Content under a given tag never changes, but the tag itself is the capability.
    'Cache-Control': 'private, max-age=3600',
  }

  if (meta.size === 0) {
    return new Response(null, { headers })
  }
  return new Response(streamHarvest(bucket, meta), { headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const { pathname } = url

    // wrangler.jsonc routes /api/* to the Worker first via run_worker_first.
    // Anything that is not the API defers to the assets binding, which is what
    // makes client-side routes such as /garden resolve via the SPA fallback.
    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }

    const bucket = env.GARDEN
    const taggedId = pathname.match(/^\/api\/(?:garden|harvest)\/([^/]+)$/)?.[1] ?? null

    if (request.method === 'GET') {
      switch (pathname) {
        case '/api/garden/sow':
          return handleSow(url, bucket)
        case '/api/garden/seed':
          return handleSeed(url, bucket)
        case '/api/garden/growth':
          return handleGrowth(url, bucket)
        case '/api/garden/ripen':
          return handleRipen(url, bucket)
        case '/api/garden':
          return handleGardenList(url, bucket)
      }

      if (taggedId !== null && pathname.startsWith('/api/garden/')) {
        const found = await requireMeta(bucket, taggedId)
        return 'response' in found ? found.response : json(found.meta)
      }
      if (taggedId !== null && pathname.startsWith('/api/harvest/')) {
        return handleHarvest(taggedId, bucket)
      }
    }

    if (request.method === 'DELETE' && taggedId !== null && pathname.startsWith('/api/garden/')) {
      if (!isValidId(taggedId)) {
        return fail('A valid tag is required', 400)
      }
      await uprootPlanting(bucket, taggedId)
      return new Response(null, { status: 204 })
    }

    return fail('Not found', 404)
  },
} satisfies ExportedHandler<Env>
