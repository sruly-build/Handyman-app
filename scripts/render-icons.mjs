// Renders public/icon.svg into the PNG icons iPhone and Android need.
// Run once with: node scripts/render-icons.mjs  (needs Playwright installed)
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { readFile } from 'node:fs/promises'

const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname })
}
await browser.close()
