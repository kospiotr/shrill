/** R2 layout and access helpers for stored uploads. */

import type { FileMeta } from '../shared/protocol'

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Ids are server-minted UUIDs, so validating one also keeps keys free of traversal. */
export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id)
}

const UPLOADS_PREFIX = 'uploads/'

const metaKey = (id: string) => `${UPLOADS_PREFIX}${id}/meta.json`
const partPrefix = (id: string) => `${UPLOADS_PREFIX}${id}/parts/`

/** Zero-padded so R2's lexicographic listing matches chunk order. */
const partKey = (id: string, index: number) => `${partPrefix(id)}${String(index).padStart(10, '0')}`

export async function readMeta(bucket: R2Bucket, id: string): Promise<FileMeta | null> {
  const object = await bucket.get(metaKey(id))
  return object ? await object.json<FileMeta>() : null
}

export async function writeMeta(bucket: R2Bucket, meta: FileMeta): Promise<void> {
  await bucket.put(metaKey(meta.id), JSON.stringify(meta), {
    httpMetadata: { contentType: 'application/json' },
  })
}

export async function putPart(
  bucket: R2Bucket,
  id: string,
  index: number,
  bytes: Uint8Array,
): Promise<void> {
  await bucket.put(partKey(id, index), bytes)
}

/** Indexes of the chunks already stored, ascending. */
export async function listReceived(bucket: R2Bucket, id: string): Promise<number[]> {
  const prefix = partPrefix(id)
  const received: number[] = []
  let cursor: string | undefined

  do {
    const page = await bucket.list({ prefix, cursor })
    for (const object of page.objects) {
      received.push(Number(object.key.slice(prefix.length)))
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return received.sort((a, b) => a - b)
}

export interface UploadPage {
  files: FileMeta[]
  /** Pass back as `cursor` to fetch the next page, when present. */
  cursor?: string
}

/**
 * One page of registered uploads, newest first, completed uploads only.
 *
 * A single `list()` with a `/` delimiter groups the bucket's keys by upload id
 * without walking every chunk object, so this costs one list call plus one
 * `get` per id on the page rather than a scan of the whole bucket.
 */
export async function listUploads(bucket: R2Bucket, options: { cursor?: string; limit?: number } = {}): Promise<UploadPage> {
  const page = await bucket.list({
    prefix: UPLOADS_PREFIX,
    delimiter: '/',
    cursor: options.cursor,
    limit: options.limit ?? 100,
  })

  const ids = (page.delimitedPrefixes ?? []).map((prefix) =>
    prefix.slice(UPLOADS_PREFIX.length, -1),
  )

  const metas = await Promise.all(ids.map((id) => readMeta(bucket, id)))
  const files = metas
    .filter((meta): meta is FileMeta => meta !== null && meta.complete)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    files,
    cursor: page.truncated ? page.cursor : undefined,
  }
}

/** Delete every object belonging to an upload. */
export async function deleteUpload(bucket: R2Bucket, id: string): Promise<void> {
  const received = await listReceived(bucket, id)
  const keys = received.map((index) => partKey(id, index))
  keys.push(metaKey(id))

  // R2 caps a bulk delete at 1000 keys per call.
  for (let offset = 0; offset < keys.length; offset += 1000) {
    await bucket.delete(keys.slice(offset, offset + 1000))
  }
}

/**
 * Concatenate the stored chunks back into the original byte stream, keeping a
 * few reads in flight so the download is not one round trip per chunk.
 */
export function streamFile(bucket: R2Bucket, meta: FileMeta): ReadableStream<Uint8Array> {
  const PREFETCH = 6
  const inFlight: Promise<R2ObjectBody | null>[] = []
  let next = 0

  function fill() {
    while (inFlight.length < PREFETCH && next < meta.chunks) {
      inFlight.push(bucket.get(partKey(meta.id, next)))
      next += 1
    }
  }

  const parts = new ReadableStream<Uint8Array>({
    start: fill,
    async pull(controller) {
      const pending = inFlight.shift()
      if (!pending) {
        controller.close()
        return
      }
      fill()

      const part = await pending
      if (!part) {
        controller.error(new Error(`Upload ${meta.id} is missing a chunk`))
        return
      }
      controller.enqueue(new Uint8Array(await part.arrayBuffer()))
    },
  })

  // The runtime ignores a hand-set Content-Length and falls back to chunked
  // encoding for an ordinary ReadableStream. Piping through a FixedLengthStream
  // is what makes the length known, so downloads get a real progress bar.
  const { readable, writable } = new FixedLengthStream(meta.size)
  parts.pipeTo(writable).catch(() => {
    // The client went away, or a chunk was missing; the readable end already
    // surfaces the failure as a truncated response.
  })
  return readable
}
