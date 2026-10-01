// shrill — paste this into the browser console on the page you want to
// upload from. It opens a file picker, uploads the chosen file in chunks via
// GET requests to this origin's /api endpoints (the same protocol the site's
// own upload page uses), and logs a share link when it's done.
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

  function pickFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.style.position = 'fixed'
      input.style.top = '-1000px'
      document.body.appendChild(input)
      input.addEventListener('change', () => {
        input.remove()
        if (input.files && input.files[0]) resolve(input.files[0])
        else reject(new Error('No file selected'))
      })
      input.addEventListener('cancel', () => {
        input.remove()
        reject(new Error('File selection cancelled'))
      })
      input.click()
    })
  }

  console.log('[shrill] choose a file in the picker that just opened…')
  const file = await pickFile()
  console.log(`[shrill] uploading ${file.name} (${file.size} bytes)`)

  const query = new URLSearchParams({ name: file.name, size: String(file.size), type: file.type })
  const meta = await readJson(await fetch(`/api/upload/init?${query}`))

  let uploaded = 0
  let next = 0

  async function worker() {
    for (;;) {
      const index = next
      next += 1
      if (index >= meta.chunks) return

      const start = index * meta.chunkSize
      const slice = file.slice(start, Math.min(start + meta.chunkSize, file.size))
      const bytes = new Uint8Array(await slice.arrayBuffer())
      const data = encodeBase64Url(bytes)

      await readJson(await fetch(`/api/upload/chunk?id=${meta.id}&index=${index}&data=${data}`))
      uploaded += 1
      console.log(`[shrill] ${uploaded} / ${meta.chunks} chunks`)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, meta.chunks || 1) }, worker))
  await readJson(await fetch(`/api/upload/complete?id=${meta.id}`))

  const link = `${location.origin}/api/download/${meta.id}`
  console.log(`[shrill] done: ${link}`)

  try {
    await navigator.clipboard.writeText(link)
    console.log('[shrill] link copied to the clipboard')
  } catch {
    // Clipboard access can need a user gesture; not fatal if it's unavailable.
  }
})()
