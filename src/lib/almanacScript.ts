/**
 * Assembles the downloadable scripts shown on the almanac page. The actual
 * source lives in src/assets/ as plain .sh/.js files — kept out of template
 * literals so they stay lintable and don't need escaping.
 */

import greenhouseTemplate from '../assets/greenhouse.sh?raw'
import browserPlantScript from '../assets/browser-plant.js?raw'

/** The bash script, with the target server baked in as its default. */
export function buildGreenhouseScript(baseUrl: string): string {
  return greenhouseTemplate
    .replace('__BASE_URL__', baseUrl)
    .replace('__BROWSER_PLANT_JS__', browserPlantScript.replace(/\n$/, ''))
}

/** The standalone browser-console script (what `greenhouse to-js` writes). */
export function getBrowserPlantScript(): string {
  return browserPlantScript
}
