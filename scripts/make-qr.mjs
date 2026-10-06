/**
 * Writes the printable QR code that sends guests to the ballot.
 *   npm run qr                    -> the GitHub Pages URL
 *   npm run qr -- https://x.y/z   -> any other URL
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import QRCode from 'qrcode'

const url = process.argv[2] || 'https://benwmax.github.io/halloween-costume-voting/'
const out = new URL('../qr/', import.meta.url)
mkdirSync(out, { recursive: true })

// High error correction survives a crease, a smudge or dim party lighting.
const options = { errorCorrectionLevel: 'H', margin: 2, color: { dark: '#1c1512', light: '#ffffff' } }

writeFileSync(new URL('vote-qr.svg', out), await QRCode.toString(url, { ...options, type: 'svg' }))
await QRCode.toFile(new URL('vote-qr.png', out).pathname, url, { ...options, width: 1200 })

console.log(`QR code for ${url}\n  qr/vote-qr.svg\n  qr/vote-qr.png`)
