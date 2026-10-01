<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { FileMeta } from '@shared/protocol'
import { fetchGarden, formatBytes, harvestLink, harvestUrl, uproot } from '@/lib/garden'

const plantings = ref<FileMeta[]>([])
const cursor = ref<string | undefined>(undefined)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const copiedId = ref<string | null>(null)

/** Id of the row awaiting a second click before it actually uproots. */
const confirmingId = ref<string | null>(null)
const uprootingId = ref<string | null>(null)
let confirmTimer: ReturnType<typeof setTimeout> | undefined

async function load() {
  loading.value = true
  error.value = null

  try {
    const page = await fetchGarden()
    plantings.value = page.files
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
    const page = await fetchGarden(cursor.value)
    plantings.value = [...plantings.value, ...page.files]
    cursor.value = page.cursor
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    loadingMore.value = false
  }
}

async function copyLink(id: string) {
  try {
    await navigator.clipboard.writeText(harvestLink(id))
    copiedId.value = id
    setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null
    }, 2000)
  } catch {
    error.value = 'Could not copy to the clipboard.'
  }
}

/** First click arms the row; a second click within the window uproots it. */
function requestUproot(id: string) {
  if (confirmingId.value === id) {
    void performUproot(id)
    return
  }

  confirmingId.value = id
  clearTimeout(confirmTimer)
  confirmTimer = setTimeout(() => {
    if (confirmingId.value === id) confirmingId.value = null
  }, 4000)
}

async function performUproot(id: string) {
  clearTimeout(confirmTimer)
  confirmingId.value = null
  uprootingId.value = id
  error.value = null

  try {
    await uproot(id)
    plantings.value = plantings.value.filter((planting) => planting.id !== id)
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    uprootingId.value = null
  }
}

onMounted(load)
onUnmounted(() => clearTimeout(confirmTimer))
</script>

<template>
  <section class="garden">
    <h1>The garden</h1>
    <p class="lede">Everything that's grown, newest first.</p>

    <p v-if="error" class="error">{{ error }}</p>

    <p v-if="loading" class="muted">Looking around…</p>

    <p v-else-if="plantings.length === 0" class="muted">Nothing has been planted yet.</p>

    <ul v-else class="list">
      <li v-for="planting in plantings" :key="planting.id" class="row">
        <div class="info">
          <span class="name">{{ planting.name }}</span>
          <span class="muted">
            {{ formatBytes(planting.size) }} ·
            {{ new Date(planting.createdAt).toLocaleString() }}
          </span>
        </div>
        <div class="row-actions">
          <button type="button" @click="copyLink(planting.id)">
            {{ copiedId === planting.id ? 'Copied' : 'Copy tag' }}
          </button>
          <a class="button primary" :href="harvestUrl(planting.id)" :download="planting.name">
            Harvest
          </a>
          <button
            type="button"
            class="danger"
            :disabled="uprootingId === planting.id"
            @click="requestUproot(planting.id)"
          >
            {{
              uprootingId === planting.id
                ? 'Uprooting…'
                : confirmingId === planting.id
                  ? 'Confirm uproot'
                  : 'Uproot'
            }}
          </button>
        </div>
      </li>
    </ul>

    <button v-if="cursor" type="button" :disabled="loadingMore" @click="loadMore">
      {{ loadingMore ? 'Looking…' : 'See more' }}
    </button>
  </section>
</template>

<style scoped>
.garden {
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
