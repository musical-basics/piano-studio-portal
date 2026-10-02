// Compress a PDF with the same code the portal runs before an upload.
// Usage:
//   npx tsx scripts/compress_pdf.ts <input.pdf> [output.pdf]
//
// Without an output path it only reports what compression would save. JPEG pages
// are skipped here: re-encoding them needs the browser's canvas.
import { readFileSync, writeFileSync } from 'fs'
import { compressPdf } from '../lib/pdf-compress'

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)}MB`

async function run() {
    const [input, output] = process.argv.slice(2)
    if (!input) {
        console.error('Usage: npx tsx scripts/compress_pdf.ts <input.pdf> [output.pdf]')
        process.exit(1)
    }

    const started = Date.now()
    const result = await compressPdf(new Uint8Array(readFileSync(input)))
    const seconds = ((Date.now() - started) / 1000).toFixed(1)

    if (!result.compressed) {
        console.log(`${mb(result.originalSize)}: nothing to gain, left as is (${seconds}s)`)
        return
    }
    console.log(`${mb(result.originalSize)} -> ${mb(result.bytes.length)}, ${result.imagesResampled} image(s) resampled (${seconds}s)`)
    if (output) {
        writeFileSync(output, result.bytes)
        console.log(`Wrote ${output}`)
    }
}
run().catch(e => { console.error(e); process.exit(1) })
