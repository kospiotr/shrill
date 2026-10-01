// greenhouse — paste this into the browser console on the page you want to
// plant from. It opens a picker, plants the chosen item seed by seed via GET
// requests to this origin's /api/garden endpoints (the same protocol the
// site's own page uses), and logs a tag to harvest it with when it's done.
(async () => {
  const CONCURRENCY = 6

  function encodeBase64Url(bytes) {
    let binary = ''
    const stride = 0x8000
    for (let offset = 0; offset < bytes.length; offset += stride) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + stride))
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  async function readJson(response) {
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error((body && body.error) || `Request failed with ${response.status}`)
    }
    return body
  }

  function pickItem() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.style.position = 'fixed'
      input.style.top = '-1000px'
      document.body.appendChild(input)
      input.addEventListener('change', () => {
        input.remove()
        if (input.files && input.files[0]) resolve(input.files[0])
        else reject(new Error('Nothing was chosen'))
      })
      input.addEventListener('cancel', () => {
        input.remove()
        reject(new Error('Selection cancelled'))
      })
      input.click()
    })
  }

  console.log('[greenhouse] choose something in the picker that just opened…')
  const chosen = await pickItem()
  console.log(`[greenhouse] planting ${chosen.name} (${chosen.size} bytes)`)

  const query = new URLSearchParams({
    name: chosen.name,
    size: String(chosen.size),
    type: chosen.type,
  })
  const meta = await readJson(await fetch(`/api/garden/sow?${query}`))

  let sown = 0
  let next = 0

  async function worker() {
    for (;;) {
      const index = next
      next += 1
      if (index >= meta.chunks) return

      const start = index * meta.chunkSize
      const slice = chosen.slice(start, Math.min(start + meta.chunkSize, chosen.size))
      const bytes = new Uint8Array(await slice.arrayBuffer())
      const data = encodeBase64Url(bytes)

      await readJson(await fetch(`/api/garden/seed?id=${meta.id}&index=${index}&data=${data}`))
      sown += 1
      console.log(`[greenhouse] ${sown} / ${meta.chunks} rows`)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, meta.chunks || 1) }, worker))
  await readJson(await fetch(`/api/garden/ripen?id=${meta.id}`))

  const tag = `${location.origin}/api/harvest/${meta.id}`
  console.log(`[greenhouse] planted: ${tag}`)

  try {
    await navigator.clipboard.writeText(tag)
    console.log('[greenhouse] tag copied to the clipboard')
  } catch {
    // Clipboard access can need a user gesture; not fatal if it's unavailable.
  }
})()
