import { describe, expect, it } from 'vitest'
import { checkUrl, readPage } from './linkPreview.js'

describe('readPage', () => {
  it('reads the usual share tags', () => {
    const html = `<html><head><title>Ignore me</title>
      <meta property="og:title" content="Moen 1225 Cartridge &amp; Clip">
      <meta property="og:image" content="/img/1225.jpg">
      <meta property="og:site_name" content="The Home Depot">
      <meta property="product:price:amount" content="24.98"></head></html>`
    expect(readPage(html)).toEqual({ title: 'Moen 1225 Cartridge & Clip', image: '/img/1225.jpg', price: 24.98, site: 'The Home Depot' })
  })
  it('prefers product data and falls back to the page title', () => {
    const html = `<title>Shop - Valve</title><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Shutoff valve","image":["https://x.com/v.png"],"offers":{"price":"8.5"}}]}</script>`
    expect(readPage(html)).toMatchObject({ title: 'Shutoff valve', image: 'https://x.com/v.png', price: 8.5 })
    expect(readPage('<title> Plain page </title>')).toMatchObject({ title: 'Plain page', image: '', price: null })
  })
})

describe('checkUrl', () => {
  it('refuses the server’s own network and odd links', async () => {
    for (const bad of ['http://127.0.0.1/x', 'http://localhost/', 'http://169.254.169.254/latest', 'http://10.0.0.5/', 'http://[::1]/', 'file:///etc/passwd', 'https://a:b@example.com/', 'http://example.com:8080/'])
      await expect(checkUrl(bad)).rejects.toThrow()
  })
})

describe('Amazon addresses', async () => {
  const { amazonId, nameFromAddress } = await import('./linkPreview.js')
  it('finds the product number and name', () => {
    const u = new URL('https://www.amazon.com/Amerock-Cabinet-Pull/dp/B07abcdef1/ref=sr_1_1?x=1')
    expect(amazonId(u)).toBe('B07ABCDEF1')
    expect(nameFromAddress(u)).toBe('Amerock Cabinet Pull')
    expect(amazonId(new URL('https://www.amazon.com/gp/product/B07ABCDEF1'))).toBe('B07ABCDEF1')
    expect(nameFromAddress(new URL('https://www.amazon.com/dp/B07ABCDEF1'))).toBe('')
    expect(amazonId(new URL('https://www.homedepot.com/dp/B07ABCDEF1'))).toBeNull()
  })
})
