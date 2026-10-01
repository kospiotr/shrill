<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  code: string
  /** Shown as a small label above the block, e.g. a filename. */
  label?: string
}>()

const copied = ref(false)
const failed = ref(false)

async function copy() {
  failed.value = false
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    failed.value = true
  }
}
</script>

<template>
  <div class="code-block">
    <div class="bar">
      <span v-if="label" class="label">{{ label }}</span>
      <button type="button" @click="copy">
        {{ failed ? 'Could not copy' : copied ? 'Copied' : 'Copy' }}
      </button>
    </div>
    <pre><code>{{ code }}</code></pre>
  </div>
</template>

<style scoped>
.code-block {
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  overflow: hidden;
  background: var(--color-background-soft);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-mute);
}

.label {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.bar button {
  padding: 0.3rem 0.75rem;
  font-size: 0.85rem;
}

pre {
  margin: 0;
  padding: 1rem;
  overflow-x: auto;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.55;
  white-space: pre;
}
</style>
