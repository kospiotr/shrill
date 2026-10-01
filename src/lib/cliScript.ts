/**
 * Assembles the downloadable CLI and browser-console scripts shown on the CLI
 * page. The actual source lives in src/assets/ as plain .sh/.js files — kept
 * out of template literals so they stay lintable and don't need escaping.
 */

import cliTemplate from '../assets/shrill-cli.sh?raw'
import browserUploadScript from '../assets/browser-upload.js?raw'

/** The bash CLI script, with the target server baked in as its default. */
export function buildCliScript(baseUrl: string): string {
  return cliTemplate
    .replace('__BASE_URL__', baseUrl)
    .replace('__BROWSER_UPLOAD_JS__', browserUploadScript.replace(/\n$/, ''))
}

/** The standalone browser-console upload script (what `shrill to-js` writes). */
export function getBrowserUploadScript(): string {
  return browserUploadScript
}
