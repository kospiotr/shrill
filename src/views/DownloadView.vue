<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FileMeta } from '@shared/protocol'
import { downloadUrl, fetchMeta, formatBytes } from '@/lib/transfer'

const route = useRoute()
const router = useRouter()

const query = ref('')
const meta = ref<FileMeta | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

/** Accept a bare id or a full share link, so a pasted URL just works. */
function parseId(input: string): string {
  const trimmed = input.trim()
  const fromUrl = trimmed.match(/\/(?:d|api\/(?:files|download))\/([^/?#]+)/)
  return fromUrl ? fromUrl[1] : trimmed
}

async function load(id: string) {
  loading.value = true
  error.value = null
  meta.value = null

  try {
    const found = await fetchMeta(id)
    if (!found.complete) {
      error.value = 'That upload never finished, so there is nothing to download.'
      return
    }
    meta.value = found
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    loading.value = false
  }
}

function lookup() {
  const id = parseId(query.value)
  if (!id) {
    error.value = 'Enter a file id or a share link.'
    return
  }
  // Navigating is enough; the route watcher performs the lookup.
  if (id === route.params.id) {
    void load(id)
  } else {
    void router.push({ name: 'download', params: { id } })
  }
}

watch(
  () => route.params.id,
  (id) => {
    const value = typeof id === 'string' ? id : ''
    query.value = value
    if (value) void load(value)
  },
  { immediate: true },
)
</script>

<template>
  <section class="download">
    <h1>Receive a file</h1>

    <form class="lookup" @submit.prevent="lookup">
      <input v-model="query" placeholder="File id or share link" spellcheck="false" />
      <button type="submit" class="primary" :disabled="loading">
        {{ loading ? 'Looking…' : 'Find' }}
      </button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="meta" class="found">
      <dl>
        <dt>File</dt>
        <dd>{{ meta.name }}</dd>
        <dt>Size</dt>
        <dd>{{ formatBytes(meta.size) }}</dd>
        <dt>Type</dt>
        <dd>{{ meta.type || 'unknown' }}</dd>
        <dt>Uploaded</dt>
        <dd>{{ new Date(meta.createdAt).toLocaleString() }}</dd>
      </dl>
      <a class="primary button" :href="downloadUrl(meta.id)" :download="meta.name">
        Download {{ meta.name }}
      </a>
    </div>
  </section>
</template>

<style scoped>
.download {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.lookup {
  display: flex;
  gap: 0.5rem;
}

.lookup input {
  flex: 1;
  min-width: 0;
}

.found {
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: var(--color-background-soft);
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

.button {
  display: inline-block;
  text-decoration: none;
}
</style>
