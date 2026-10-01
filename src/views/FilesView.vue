<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { FileMeta } from '@shared/protocol'
import { downloadUrl, fetchFiles, formatBytes, shareUrl } from '@/lib/transfer'

const files = ref<FileMeta[]>([])
const cursor = ref<string | undefined>(undefined)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const copiedId = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null

  try {
    const page = await fetchFiles()
    files.value = page.files
    cursor.value = page.cursor
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!cursor.value || loadingMore.value) return
  loadingMore.value = true

  try {
    const page = await fetchFiles(cursor.value)
    files.value = [...files.value, ...page.files]
    cursor.value = page.cursor
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    loadingMore.value = false
  }
}

async function copyLink(id: string) {
  try {
    await navigator.clipboard.writeText(shareUrl(id))
    copiedId.value = id
    setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null
    }, 2000)
  } catch {
    error.value = 'Could not copy to the clipboard.'
  }
}

onMounted(load)
</script>

<template>
  <section class="files">
    <h1>Available files</h1>
    <p class="lede">Every completed upload, newest first.</p>

    <p v-if="error" class="error">{{ error }}</p>

    <p v-if="loading" class="muted">Loading…</p>

    <p v-else-if="files.length === 0" class="muted">No files have been uploaded yet.</p>

    <ul v-else class="list">
      <li v-for="file in files" :key="file.id" class="row">
        <div class="info">
          <span class="name">{{ file.name }}</span>
          <span class="muted">
            {{ formatBytes(file.size) }} · {{ new Date(file.createdAt).toLocaleString() }}
          </span>
        </div>
        <div class="row-actions">
          <button type="button" @click="copyLink(file.id)">
            {{ copiedId === file.id ? 'Copied' : 'Copy link' }}
          </button>
          <a class="button primary" :href="downloadUrl(file.id)" :download="file.name">
            Download
          </a>
        </div>
      </li>
    </ul>

    <button v-if="cursor" type="button" :disabled="loadingMore" @click="loadMore">
      {{ loadingMore ? 'Loading…' : 'Load more' }}
    </button>
  </section>
</template>

<style scoped>
.files {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.lede {
  color: var(--color-text-muted);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  list-style: none;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  background: var(--color-background-soft);
}

.info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.name {
  font-weight: 550;
  word-break: break-all;
}

.row-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.button {
  text-decoration: none;
}
</style>
