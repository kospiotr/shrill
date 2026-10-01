/** R2 layout and access helpers for stored plantings. */

import type { FileMeta } from '../shared/protocol'

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Ids are server-minted UUIDs, so validating one also keeps keys free of traversal. */
export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id)
}

const GARDEN_PREFIX = 'garden/'

const metaKey = (id: string) => `${GARDEN_PREFIX}${id}/meta.json`
const seedPrefix = (id: string) => `${GARDEN_PREFIX}${id}/seeds/`

/** Zero-padded so R2's lexicographic listing matches seed order. */
const seedKey = (id: string, index: number) => `${seedPrefix(id)}${String(index).padStart(10, '0')}`

export async function readMeta(bucket: R2Bucket, id: string): Promise<FileMeta | null> {
  const object = await bucket.get(metaKey(id))
  return object ? await object.json<FileMeta>() : null
}

export async function writeMeta(bucket: R2Bucket, meta: FileMeta): Promise<void> {
  await bucket.put(metaKey(meta.id), JSON.stringify(meta), {
    httpMetadata: { contentType: 'application/json' },
  })
}

export async function putSeed(
  bucket: R2Bucket,
  id: string,
  index: number,
  bytes: Uint8Array,
): Promise<void> {
  await bucket.put(seedKey(id, index), bytes)
}

/** Indexes of the seeds already sown, ascending. */
export async function listSown(bucket: R2Bucket, id: string): Promise<number[]> {
  const prefix = seedPrefix(id)
  const sown: number[] = []
  let cursor: string | undefined

  do {
    const page = await bucket.list({ prefix, cursor })
    for (const object of page.objects) {
      sown.push(Number(object.key.slice(prefix.length)))
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return sown.sort((a, b) => a - b)
}

export interface GardenPage {
  files: FileMeta[]
  /** Pass back as `cursor` to fetch the next page, when present. */
  cursor?: string
}

/**
 * One page of registered plantings, newest first, finished ones only.
 *
 * A single `list()` with a `/` delimiter groups the bucket's keys by planting
 * id without walking every seed object, so this costs one list call plus one
 * `get` per id on the page rather than a scan of the whole bucket.
 */
export async function listGarden(bucket: R2Bucket, options: { cursor?: string; limit?: number } = {}): Promise<GardenPage> {
  const page = await bucket.list({
    prefix: GARDEN_PREFIX,
    delimiter: '/',
    cursor: options.cursor,
    limit: options.limit ?? 100,
  })

  const ids = (page.delimitedPrefixes ?? []).map((prefix) =>
    prefix.slice(GARDEN_PREFIX.length, -1),
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

/** Remove every object belonging to a planting. */
export async function uprootPlanting(bucket: R2Bucket, id: string): Promise<void> {
  const sown = await listSown(bucket, id)
  const keys = sown.map((index) => seedKey(id, index))
  keys.push(metaKey(id))

  // R2 caps a bulk delete at 1000 keys per call.
  for (let offset = 0; offset < keys.length; offset += 1000) {
    await bucket.delete(keys.slice(offset, offset + 1000))
  }
}

/**
 * Concatenate the sown seeds back into the original byte stream, keeping a
 * few reads in flight so a harvest is not one round trip per seed.
 */
export function streamHarvest(bucket: R2Bucket, meta: FileMeta): ReadableStream<Uint8Array> {
  const PREFETCH = 6
  const inFlight: Promise<R2ObjectBody | null>[] = []
  let next = 0

  function fill() {
    while (inFlight.length < PREFETCH && next < meta.chunks) {
      inFlight.push(bucket.get(seedKey(meta.id, next)))
      next += 1
    }
  }

  const seeds = new ReadableStream<Uint8Array>({
    start: fill,
    async pull(controller) {
      const pending = inFlight.shift()
      if (!pending) {
        controller.close()
        return
      }
      fill()

      const seed = await pending
      if (!seed) {
        controller.error(new Error(`Planting ${meta.id} is missing a row`))
        return
      }
      controller.enqueue(new Uint8Array(await seed.arrayBuffer()))
    },
  })

  // The runtime ignores a hand-set Content-Length and falls back to chunked
  // encoding for an ordinary ReadableStream. Piping through a FixedLengthStream
  // is what makes the length known, so a harvest gets a real progress bar.
  const { readable, writable } = new FixedLengthStream(meta.size)
  seeds.pipeTo(writable).catch(() => {
    // The client went away, or a row was missing; the readable end already
    // surfaces the failure as a truncated response.
  })
  return readable
}
