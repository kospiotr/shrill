<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FileMeta } from '@shared/protocol'
import { MAX_FILE_SIZE } from '@shared/protocol'
import {
  discardUpload,
  downloadUrl,
  formatBytes,
  shareUrl,
  uploadFile,
  type UploadProgress,
} from '@/lib/transfer'

const file = ref<File | null>(null)
const progress = ref<UploadProgress | null>(null)
const result = ref<FileMeta | null>(null)
const error = ref<string | null>(null)
const dragging = ref(false)
const copied = ref(false)

let controller: AbortController | null = null
/** Id of an upload in flight, so cancelling can clean up its chunks. */
let pendingId: string | null = null

const busy = computed(() => progress.value !== null)
const percent = computed(() => Math.round((progress.value?.fraction ?? 0) * 100))
const link = computed(() => (result.value ? shareUrl(result.value.id) : ''))

function select(next: File | null) {
  if (busy.value) return
  file.value = next
  result.value = null
  error.value = null
  copied.value = false

  if (next && next.size > MAX_FILE_SIZE) {
    error.value = `${next.name} is ${formatBytes(next.size)}; the limit is ${formatBytes(MAX_FILE_SIZE)}.`
    file.value = null
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  select(input.files?.[0] ?? null)
}

function onDrop(event: DragEvent) {
  dragging.value = false
  select(event.dataTransfer?.files?.[0] ?? null)
}

async function send() {
  if (!file.value || busy.value) return

  controller = new AbortController()
  error.value = null
  result.value = null
  progress.value = null

  try {
    result.value = await uploadFile(file.value, {
      signal: controller.signal,
      onMeta: (meta) => {
        pendingId = meta.id
      },
      onProgress: (next) => {
        progress.value = next
      },
    })
    pendingId = null
  } catch (cause) {
    const aborted = cause instanceof DOMException && cause.name === 'AbortError'
    error.value = aborted ? 'Upload cancelled.' : (cause as Error).message

    // Drop the chunks that did make it, so a cancelled upload leaves nothing behind.
    if (pendingId) {
      const id = pendingId
      pendingId = null
      void discardUpload(id).catch(() => {})
    }
  } finally {
    progress.value = null
    controller = null
  }
}

function cancel() {
  controller?.abort()
}

function reset() {
  file.value = null
  result.value = null
  error.value = null
  copied.value = false
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    error.value = 'Could not copy to the clipboard; select the link and copy it manually.'
  }
}
</script>

<template>
  <section class="upload">
    <h1>Send a file</h1>
    <p class="lede">
      The file is sliced in the browser and each slice is sent as its own GET request, then
      reassembled on download.
    </p>

    <label
      class="dropzone"
      :class="{ dragging, disabled: busy }"
      @dragover.prevent="dragging = !busy"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <input type="file" :disabled="busy" @change="onFileChange" />
      <strong v-if="file">{{ file.name }}</strong>
      <strong v-else>Drop a file here, or click to choose</strong>
      <span v-if="file" class="muted">{{ formatBytes(file.size) }}</span>
      <span v-else class="muted">Up to {{ formatBytes(MAX_FILE_SIZE) }}</span>
    </label>

    <div class="actions">
      <button type="button" class="primary" :disabled="!file || busy" @click="send">
        {{ busy ? 'Uploading…' : 'Upload' }}
      </button>
      <button v-if="busy" type="button" @click="cancel">Cancel</button>
      <button v-else-if="file || result" type="button" @click="reset">Clear</button>
    </div>

    <div v-if="progress" class="progress" role="status">
      <div class="track"><div class="bar" :style="{ width: `${percent}%` }" /></div>
      <span class="muted">
        {{ percent }}% · chunk {{ progress.uploaded }} of {{ progress.total }} ·
        {{ formatBytes(progress.bytes) }} of {{ formatBytes(progress.size) }}
      </span>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="result" class="result">
      <h2>Upload complete</h2>
      <dl>
        <dt>File</dt>
        <dd>{{ result.name }} ({{ formatBytes(result.size) }})</dd>
        <dt>Chunks</dt>
        <dd>{{ result.chunks }} × {{ formatBytes(result.chunkSize) }}</dd>
        <dt>Id</dt>
        <dd><code>{{ result.id }}</code></dd>
      </dl>
      <div class="share">
        <input :value="link" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button type="button" @click="copyLink">{{ copied ? 'Copied' : 'Copy' }}</button>
      </div>
      <a class="download" :href="downloadUrl(result.id)">Download it now</a>
    </div>
  </section>
</template>

<style scoped>
.upload {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.lede {
  color: var(--color-text-muted);
  margin-bottom: 0.5rem;
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 9rem;
  padding: 1.5rem;
  text-align: center;
  border: 2px dashed var(--color-border);
  border-radius: 0.75rem;
  background: var(--color-background-soft);
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.dropzone:hover:not(.disabled),
.dropzone.dragging {
  border-color: var(--color-accent);
  background: var(--color-background-mute);
}

.dropzone.disabled {
  cursor: default;
  opacity: 0.6;
}

.dropzone strong {
  font-weight: 600;
  word-break: break-all;
}

.dropzone input {
  display: none;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.progress {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.track {
  height: 0.5rem;
  border-radius: 999px;
  background: var(--color-background-mute);
  overflow: hidden;
}

.bar {
  height: 100%;
  background: var(--color-accent);
  transition: width 0.15s linear;
}

.result {
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: var(--color-background-soft);
}

.result h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1rem;
  margin-bottom: 1rem;
}

dt {
  color: var(--color-text-muted);
}

dd {
  word-break: break-all;
}

.share {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.share input {
  flex: 1;
  min-width: 0;
}

.download {
  color: var(--color-accent);
}
</style>
