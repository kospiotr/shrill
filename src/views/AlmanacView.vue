<script setup lang="ts">
import { computed } from 'vue'
import CodeBlock from '@/components/CodeBlock.vue'
import { buildGreenhouseScript, getBrowserPlantScript } from '@/lib/almanacScript'

// This is a plain client-rendered SPA, so window is always available here.
const baseUrl = window.location.origin

const plantExample = computed(
  () => `# 1. Start a planting — the response carries the row size to use
curl "${baseUrl}/api/garden/sow?name=hello.txt&size=11&type=text/plain"
# -> {"id":"<id>","chunkSize":6144,"chunks":1,"complete":false,...}

# 2. Sow each seed, base64url-encoded, as its own GET
curl "${baseUrl}/api/garden/seed?id=<id>&index=0&data=$(printf 'hello world' | base64 | tr '+/' '-_' | tr -d '=\\n')"

# 3. Finish once every seed has taken root
curl "${baseUrl}/api/garden/ripen?id=<id>"`,
)

const harvestExample = computed(
  () => `# Fetch details (name, size, type) for a tag
curl "${baseUrl}/api/garden/<id>"

# Harvest it
curl -o hello.txt "${baseUrl}/api/harvest/<id>"

# Check growth — which rows have taken root
curl "${baseUrl}/api/garden/growth?id=<id>"

# See the whole garden, newest first
curl "${baseUrl}/api/garden"`,
)

const greenhouseScript = computed(() => buildGreenhouseScript(baseUrl))
const browserScript = getBrowserPlantScript()
</script>

<template>
  <section class="almanac">
    <h1>Work the plot by hand</h1>
    <p class="lede">
      Everything here moves through plain <code>GET</code> requests: whatever you plant is split
      into seeds, each sown with its own request, and the whole row grows back together the
      moment you harvest. The two scripts below do the splitting and sowing for you.
    </p>

    <h2>Examples</h2>

    <h3>Plant</h3>
    <CodeBlock :code="plantExample" label="bash" />

    <h3>Harvest &amp; look around</h3>
    <CodeBlock :code="harvestExample" label="bash" />

    <h2>The script</h2>
    <p class="lede">
      Handles splitting, encoding, and progress for you. Save it, make it executable, and run it
      against this server.
    </p>
    <CodeBlock :code="greenhouseScript" label="greenhouse.sh" />
    <p class="muted">
      <code>chmod +x greenhouse.sh</code> then <code>./greenhouse.sh plant &lt;path&gt;</code>,
      <code>./greenhouse.sh harvest &lt;id&gt;</code>, or
      <code>./greenhouse.sh growth &lt;id&gt;</code>. Point it at a different server with
      <code>GREENHOUSE_URL=https://example.com ./greenhouse.sh …</code>.
    </p>

    <h2>From a browser console</h2>
    <p class="lede">
      <code>./greenhouse.sh to-js</code> writes this same script to disk. Paste it into the
      console on the page you want to plant from — it opens a picker, plants the chosen item
      seed by seed, and logs a tag to harvest it with when it's done.
    </p>
    <CodeBlock :code="browserScript" label="greenhouse-plant.js" />
  </section>
</template>

<style scoped>
.almanac {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.lede {
  color: var(--color-text-muted);
}

h2 {
  margin-top: 0.5rem;
  font-size: 1.15rem;
  font-weight: 600;
}

h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-muted);
}
</style>
