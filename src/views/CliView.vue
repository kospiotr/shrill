<script setup lang="ts">
import { computed } from 'vue'
import CodeBlock from '@/components/CodeBlock.vue'
import { buildCliScript, getBrowserUploadScript } from '@/lib/cliScript'

// This is a plain client-rendered SPA, so window is always available here.
const baseUrl = window.location.origin

const uploadExample = computed(
  () => `# 1. Register the upload — the response carries the chunk size to use
curl "${baseUrl}/api/upload/init?name=hello.txt&size=11&type=text/plain"
# -> {"id":"<id>","chunkSize":6144,"chunks":1,"complete":false,...}

# 2. Send each chunk, base64url-encoded, as its own GET
curl "${baseUrl}/api/upload/chunk?id=<id>&index=0&data=$(printf 'hello world' | base64 | tr '+/' '-_' | tr -d '=\\n')"

# 3. Finalise once every chunk has arrived
curl "${baseUrl}/api/upload/complete?id=<id>"`,
)

const downloadExample = computed(
  () => `# Fetch metadata (name, size, type) for an id
curl "${baseUrl}/api/files/<id>"

# Download the reassembled file
curl -o hello.txt "${baseUrl}/api/download/<id>"

# Check upload progress — which chunks have arrived
curl "${baseUrl}/api/upload/status?id=<id>"

# List every completed upload, newest first
curl "${baseUrl}/api/files"`,
)

const cliScript = computed(() => buildCliScript(baseUrl))
const browserScript = getBrowserUploadScript()
</script>

<template>
  <section class="cli">
    <h1>Use the API directly</h1>
    <p class="lede">
      Every upload request is a plain <code>GET</code> with the payload in the query string: a
      file is sliced into chunks, each chunk is base64url-encoded, and the server reassembles
      them in order on download. No request body, ever — the two scripts below do the chunking
      and encoding for you.
    </p>

    <h2>Examples</h2>

    <h3>Upload</h3>
    <CodeBlock :code="uploadExample" label="bash" />

    <h3>Download &amp; inspect</h3>
    <CodeBlock :code="downloadExample" label="bash" />

    <h2>CLI script</h2>
    <p class="lede">
      Handles chunking, encoding, and progress for you. Save it, make it executable, and run it
      against this server.
    </p>
    <CodeBlock :code="cliScript" label="shrill.sh" />
    <p class="muted">
      <code>chmod +x shrill.sh</code> then <code>./shrill.sh upload &lt;path&gt;</code>,
      <code>./shrill.sh download &lt;id&gt;</code>, or <code>./shrill.sh status &lt;id&gt;</code>.
      Point it at a different server with <code>SHRILL_URL=https://example.com ./shrill.sh …</code>.
    </p>

    <h2>Upload from a browser console</h2>
    <p class="lede">
      <code>./shrill.sh to-js</code> writes this same script to a file. Paste it into the
      console on the page you want to upload from — it opens a file picker, uploads the chosen
      file in chunks, and logs a share link when it's done.
    </p>
    <CodeBlock :code="browserScript" label="shrill-upload.js" />
  </section>
</template>

<style scoped>
.cli {
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
