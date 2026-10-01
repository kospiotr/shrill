/**
 * Base64url codec. Unlike plain base64, the alphabet is URL-safe, so a chunk
 * needs no percent-encoding and costs exactly 4 characters per 3 bytes.
 */

export const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/

/** Largest slice handed to String.fromCharCode at once, to stay under the arg limit. */
const STRIDE = 0x8000

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += STRIDE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + STRIDE))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
