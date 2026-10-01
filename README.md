# shrill

Chunked file transfer on Cloudflare Workers, where **every upload request is a
plain `GET`** with the payload carried in the query string. Files are stored in
R2 and streamed back in order on download.

The GET-only upload path is the point of the project: it works in places where
request bodies are stripped, rewritten, or disallowed.

## How it works

A file is sliced in the browser into `CHUNK_SIZE` pieces. Each piece is
base64url-encoded — a URL-safe alphabet, so it survives a query string without
percent-encoding — and sent as its own `GET`. The Worker decodes each chunk back
to bytes and writes it to R2 as a separate object. Download concatenates the
objects back into one byte stream.

Chunks are 6 KiB of raw data, about 8 KB of URL once encoded. Cloudflare caps a
URL at 16 KB, and the Worker rejects anything decoding to more than
`MAX_CHUNK_SIZE`.

### Storage layout

```
uploads/<id>/meta.json       FileMeta: name, size, type, chunkSize, chunks, complete
uploads/<id>/parts/0000000000  raw bytes of chunk 0
uploads/<id>/parts/0000000001  raw bytes of chunk 1
```

Part keys are zero-padded so R2's lexicographic listing matches chunk order.
Ids are server-minted UUIDs, which is also what keeps storage keys free of path
traversal.

## API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/api/upload/init?name&size&type` | Register an upload; returns `FileMeta` with the `id` and the `chunkSize` to use |
| `GET` | `/api/upload/chunk?id&index&data` | Store one base64url chunk |
| `GET` | `/api/upload/status?id` | Which chunks arrived, and which are missing — enough to resume |
| `GET` | `/api/upload/complete?id` | Verify every chunk is present and finalise |
| `GET` | `/api/files?cursor` | `FileListPage` of completed uploads, newest first |
| `GET` | `/api/files/:id` | Metadata for one upload |
| `DELETE` | `/api/files/:id` | Delete an upload and all its chunks |
| `GET` | `/api/download/:id` | The reassembled file |

Clients should use the `chunkSize` returned by `init` rather than assuming one.

## Pages

- `/` — pick or drop a file, watch per-chunk progress, get a share link.
- `/d/:id` — look up a file by id or share link and download it.
- `/files` — every completed upload, newest first, with a copy-link and
  download action for each.

## Setup

```sh
npm install
npx wrangler r2 bucket create shrill-uploads   # once, per account
npm run dev
```

`npm run dev` serves the SPA and the Worker together against a local R2
simulation, so no bucket is needed to develop.

## Deploy

```sh
npm run deploy
```

The R2 binding lives in `wrangler.jsonc` as `UPLOADS`. After changing bindings,
regenerate types with `npm run cf-typegen`.

## Limits

Both are in `shared/protocol.ts`, which the Worker and the browser share:

- `MAX_FILE_SIZE` — 512 MB
- `CHUNK_SIZE` — 6 KiB raw per request

Note that the endpoints are unauthenticated: anyone with the URL can upload, and
`/files` lists every completed upload for anyone who opens it — so there is no
real privacy to an id once a file is up. Treat this as a public bucket, not a
private share.
