import { compressPdf, type JpegRecoder } from '@/lib/pdf-compress'

/**
 * Browser side of PDF compression: turns a picked File into a smaller File
 * before it is uploaded, and supplies the canvas-based JPEG codec the core needs.
 *
 * Loaded on demand (it pulls in the PDF library), so it costs nothing until
 * someone actually attaches a PDF.
 */

/** Smaller PDFs have nothing oversized in them; skip the work. */
const MIN_SIZE_TO_COMPRESS = 1.5 * 1024 * 1024
const JPEG_QUALITY = 0.8

export function isPdfFile(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/**
 * Drop EXIF blocks from a JPEG. PDF viewers ignore the EXIF rotation flag but
 * browsers apply it when decoding, so a flagged page would come back turned.
 */
function stripExif(jpeg: Uint8Array): Uint8Array {
    const kept: Uint8Array[] = [jpeg.subarray(0, 2)]
    let i = 2
    let dropped = false

    while (i + 4 <= jpeg.length && jpeg[i] === 0xff) {
        const marker = jpeg[i + 1]
        // Start of scan: everything after this is image data.
        if (marker === 0xda) break
        const length = (jpeg[i + 2] << 8) | jpeg[i + 3]
        if (length < 2) return jpeg
        if (marker === 0xe1) dropped = true
        else kept.push(jpeg.subarray(i, i + 2 + length))
        i += 2 + length
    }
    if (!dropped) return jpeg

    kept.push(jpeg.subarray(i))
    const out = new Uint8Array(kept.reduce((total, part) => total + part.length, 0))
    let offset = 0
    for (const part of kept) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

function canvasOf(width: number, height: number) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    // JPEG has no transparency; anything undrawn should be paper, not black.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    return { canvas, context }
}

const recodeJpegOnCanvas: JpegRecoder = async (jpeg, width, height) => {
    let bitmap: ImageBitmap
    try {
        bitmap = await createImageBitmap(new Blob([stripExif(jpeg) as BlobPart], { type: 'image/jpeg' }))
    } catch {
        // Too large for this device to decode, or not a JPEG the browser reads.
        return null
    }

    try {
        // Shrinking by more than half in one step skips pixels and leaves thin
        // lines jagged, so halve until the last step is a gentle one.
        let source: CanvasImageSource = bitmap
        let sourceWidth = bitmap.width
        let sourceHeight = bitmap.height
        while (sourceWidth / 2 >= width && sourceHeight / 2 >= height) {
            const halfWidth = Math.ceil(sourceWidth / 2)
            const halfHeight = Math.ceil(sourceHeight / 2)
            const step = canvasOf(halfWidth, halfHeight)
            step.context.drawImage(source, 0, 0, halfWidth, halfHeight)
            source = step.canvas
            sourceWidth = halfWidth
            sourceHeight = halfHeight
        }

        const { canvas, context } = canvasOf(width, height)
        context.drawImage(source, 0, 0, width, height)

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
        return blob ? new Uint8Array(await blob.arrayBuffer()) : null
    } catch {
        return null
    } finally {
        bitmap.close()
    }
}

/**
 * Compress a PDF before upload. Always resolves to a usable file: the original
 * comes back untouched when it isn't a PDF, is already small, or can't be made
 * meaningfully smaller.
 */
export async function compressPdfFile(file: File): Promise<File> {
    if (!isPdfFile(file) || file.size < MIN_SIZE_TO_COMPRESS) return file

    try {
        const result = await compressPdf(new Uint8Array(await file.arrayBuffer()), { recodeJpeg: recodeJpegOnCanvas })
        if (!result.compressed) return file
        return new File([result.bytes as BlobPart], file.name, {
            type: 'application/pdf',
            lastModified: file.lastModified,
        })
    } catch (error) {
        console.error('PDF compression failed; uploading the original:', error)
        return file
    }
}
