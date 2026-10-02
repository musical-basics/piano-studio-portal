import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from 'pdf-lib'
import { unzlibSync, zlibSync } from 'fflate'

/**
 * Shrink a PDF by resampling page images that carry far more pixels than a
 * printed page can show.
 *
 * Sheet music PDFs are usually scans, and the big ones are big for one of two
 * reasons: black-and-white pages stored at 1200+ dpi, or photo-style JPEG pages
 * several thousand pixels wide. Both are resampled down to print resolution and
 * written back into the same PDF, so page sizes, text, vector graphics and
 * everything else in the file are left exactly as they were.
 *
 * It is deliberately conservative. Anything it doesn't fully understand (an
 * unusual colour space, an encrypted file, a filter it can't decode) is left
 * alone, and the original bytes are returned unless the result is meaningfully
 * smaller.
 *
 * Runs in the browser and in Node. JPEG pages need an image codec, which the
 * caller supplies (a canvas in the browser); without one they are skipped.
 */

/** Re-encode a JPEG at the given pixel size. Return null to leave the image alone. */
export type JpegRecoder = (jpeg: Uint8Array, width: number, height: number) => Promise<Uint8Array | null>

export interface CompressPdfOptions {
    recodeJpeg?: JpegRecoder
    /** Resolution kept for 1-bit (black-and-white) scans. */
    bilevelPpi?: number
    /** Resolution kept for greyscale and colour images. */
    contonePpi?: number
}

export interface CompressPdfResult {
    /** The compressed file, or the original bytes when compression didn't help. */
    bytes: Uint8Array
    compressed: boolean
    originalSize: number
    imagesResampled: number
}

const DEFAULT_BILEVEL_PPI = 600
const DEFAULT_CONTONE_PPI = 220

/** Only resample when it removes at least this share of the pixels along each edge. */
const MAX_SCALE = 0.75
/** A resampled image, and the finished file, must each be at least this much smaller. */
const MIN_SAVINGS = 0.1
/** A target pixel becomes ink when this share of the source pixels under it were ink. */
const INK_COVERAGE = 0.4
/** Refuse to unpack images bigger than this; they would exhaust a phone's memory. */
const MAX_DECODED_BYTES = 300 * 1024 * 1024

/**
 * Sheet music is read and printed at about 9x12in whatever size the file
 * declares. Exporters write pages anywhere from two inches to several feet wide,
 * so every page is scaled to this size when working out how many pixels an image
 * needs. Trusting a tiny declared page would shrink a full page of music to a
 * thumbnail.
 */
const PRINT_SHORT_IN = 9
const PRINT_LONG_IN = 12

const name = (value: string) => PDFName.of(value)

interface PrintBox {
    widthIn: number
    heightIn: number
}

function printBox(widthPt: number, heightPt: number): PrintBox {
    const short = Math.min(widthPt, heightPt) / 72
    const long = Math.max(widthPt, heightPt) / 72
    const fit = Math.min(PRINT_SHORT_IN / short, PRINT_LONG_IN / long)
    return { widthIn: (widthPt / 72) * fit, heightIn: (heightPt / 72) * fit }
}

/**
 * Find every image drawn on a page, along with the largest page it appears on.
 * Images are assumed to fill the page: one drawn smaller ends up with more
 * resolution than the target, never less.
 */
function collectPageImages(doc: PDFDocument): Map<PDFRef, PrintBox> {
    const context = doc.context
    const images = new Map<PDFRef, PrintBox>()

    const walk = (resources: PDFDict | undefined, box: PrintBox, depth: number, seenForms: Set<PDFRef>) => {
        if (!resources) return
        const xobjects = resources.lookup(name('XObject'))
        if (!(xobjects instanceof PDFDict)) return

        for (const [, value] of xobjects.entries()) {
            if (!(value instanceof PDFRef)) continue
            const stream = context.lookup(value)
            if (!(stream instanceof PDFRawStream)) continue

            const subtype = stream.dict.lookup(name('Subtype'))
            if (subtype === name('Image')) {
                const known = images.get(value)
                images.set(value, known
                    ? { widthIn: Math.max(known.widthIn, box.widthIn), heightIn: Math.max(known.heightIn, box.heightIn) }
                    : box)
            } else if (subtype === name('Form') && depth < 4 && !seenForms.has(value)) {
                seenForms.add(value)
                const formResources = stream.dict.lookup(name('Resources'))
                walk(formResources instanceof PDFDict ? formResources : undefined, box, depth + 1, seenForms)
            }
        }
    }

    for (const page of doc.getPages()) {
        try {
            const { width, height } = page.getSize()
            if (!(width > 0 && height > 0)) continue
            walk(page.node.Resources(), printBox(width, height), 0, new Set())
        } catch {
            // A page with a malformed resource tree just contributes no images.
        }
    }
    return images
}

function numberOf(dict: PDFDict, key: string): number | undefined {
    const value = dict.lookup(name(key))
    return value instanceof PDFNumber ? value.asNumber() : undefined
}

/** The image's single filter, '' when unfiltered, or null when it has a chain we don't handle. */
function singleFilter(dict: PDFDict): { filter: string; parms: PDFDict | undefined } | null {
    const filter = dict.lookup(name('Filter'))
    const parms = dict.lookup(name('DecodeParms'))

    if (filter === undefined) return { filter: '', parms: undefined }
    if (filter instanceof PDFName) {
        return { filter: filter.asString(), parms: parms instanceof PDFDict ? parms : undefined }
    }
    if (filter instanceof PDFArray && filter.size() === 1) {
        const only = filter.lookup(0)
        if (!(only instanceof PDFName)) return null
        const firstParms = parms instanceof PDFArray && parms.size() > 0 ? parms.lookup(0) : parms
        return { filter: only.asString(), parms: firstParms instanceof PDFDict ? firstParms : undefined }
    }
    return null
}

/** Components per pixel, or null for colour spaces whose samples can't simply be averaged. */
function colorComponents(dict: PDFDict, bitsPerComponent: number): number | null {
    const space = dict.lookup(name('ColorSpace'))
    if (space instanceof PDFName) {
        if (space === name('DeviceGray') || space === name('CalGray')) return 1
        if (space === name('DeviceRGB') || space === name('CalRGB')) return 3
        return null
    }
    if (space instanceof PDFArray && space.size() > 0) {
        const family = space.lookup(0)
        if (family === name('CalGray')) return 1
        if (family === name('CalRGB')) return 3
        if (family === name('ICCBased')) {
            const profile = space.lookup(1)
            const n = profile instanceof PDFRawStream ? numberOf(profile.dict, 'N') : undefined
            return n === 1 || n === 3 ? n : null
        }
        // A two-colour palette is still just ink and paper. Wider palettes hold
        // indexes, which can't be averaged.
        if (family === name('Indexed') && bitsPerComponent === 1) return 1
    }
    return null
}

function isImageMask(dict: PDFDict): boolean {
    return dict.lookup(name('ImageMask'))?.toString() === 'true'
}

/** Undo a PNG row predictor (Predictor 10-15), as used by FlateDecode. */
function undoPngPredictor(data: Uint8Array, rowBytes: number, rows: number, bytesPerPixel: number): Uint8Array | null {
    if (data.length < (rowBytes + 1) * rows) return null
    const out = new Uint8Array(rowBytes * rows)

    for (let y = 0; y < rows; y++) {
        const filterType = data[y * (rowBytes + 1)]
        const src = y * (rowBytes + 1) + 1
        const dst = y * rowBytes
        const prev = dst - rowBytes

        for (let x = 0; x < rowBytes; x++) {
            const raw = data[src + x]
            const left = x >= bytesPerPixel ? out[dst + x - bytesPerPixel] : 0
            const up = y > 0 ? out[prev + x] : 0
            const upLeft = y > 0 && x >= bytesPerPixel ? out[prev + x - bytesPerPixel] : 0

            let predicted: number
            switch (filterType) {
                case 0: predicted = 0; break
                case 1: predicted = left; break
                case 2: predicted = up; break
                case 3: predicted = (left + up) >> 1; break
                case 4: {
                    const p = left + up - upLeft
                    const pa = Math.abs(p - left)
                    const pb = Math.abs(p - up)
                    const pc = Math.abs(p - upLeft)
                    predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
                    break
                }
                default: return null
            }
            out[dst + x] = (raw + predicted) & 0xff
        }
    }
    return out
}

/** Unpack a FlateDecode (or unfiltered) image into raw samples, or null if we can't. */
function decodeSamples(
    contents: Uint8Array,
    filter: string,
    parms: PDFDict | undefined,
    rowBytes: number,
    rows: number,
    bytesPerPixel: number,
): Uint8Array | null {
    let data: Uint8Array
    if (filter === '') {
        data = contents
    } else if (filter === '/FlateDecode') {
        data = unzlibSync(contents)
    } else {
        return null
    }

    const predictor = parms ? numberOf(parms, 'Predictor') ?? 1 : 1
    if (predictor >= 10) {
        return undoPngPredictor(data, rowBytes, rows, bytesPerPixel)
    }
    if (predictor !== 1) return null
    return data.length >= rowBytes * rows ? data : null
}

const BIT_COUNT = new Uint8Array(256)
for (let i = 1; i < 256; i++) BIT_COUNT[i] = BIT_COUNT[i >> 1] + (i & 1)

/** For each source column, the target column it lands in, plus how many land in each. */
function mapColumns(width: number, targetWidth: number) {
    const columnOf = new Uint32Array(width)
    const span = new Uint32Array(targetWidth)
    for (let x = 0; x < width; x++) {
        const target = Math.min(targetWidth - 1, Math.floor((x * targetWidth) / width))
        columnOf[x] = target
        span[target]++
    }
    return { columnOf, span }
}

/**
 * Downsample a packed 1-bit image. Whichever bit value is rarer is the ink, and
 * a target pixel is ink when enough of the pixels under it were, so thin staff
 * lines and stems survive rather than fading to paper.
 */
function downsampleBilevel(src: Uint8Array, width: number, height: number, targetWidth: number, targetHeight: number): Uint8Array {
    const rowBytes = (width + 7) >> 3
    const targetRowBytes = (targetWidth + 7) >> 3

    let ones = 0
    for (let i = 0; i < rowBytes * height; i++) ones += BIT_COUNT[src[i]]
    const inkIsOne = ones * 2 < rowBytes * 8 * height
    const paperByte = inkIsOne ? 0x00 : 0xff

    const { columnOf, span } = mapColumns(width, targetWidth)
    const out = new Uint8Array(targetRowBytes * targetHeight).fill(paperByte)
    const counts = new Uint32Array(targetWidth)

    let sy = 0
    for (let ty = 0; ty < targetHeight; ty++) {
        const end = ty === targetHeight - 1 ? height : Math.floor(((ty + 1) * height) / targetHeight)
        const rows = end - sy
        counts.fill(0)

        for (; sy < end; sy++) {
            const base = sy * rowBytes
            for (let b = 0; b < rowBytes; b++) {
                const value = src[base + b]
                if (value === paperByte) continue
                const ink = inkIsOne ? value : ~value & 0xff
                const x0 = b << 3
                for (let bit = 0; bit < 8; bit++) {
                    const x = x0 + bit
                    if (ink & (0x80 >> bit) && x < width) counts[columnOf[x]]++
                }
            }
        }

        const outBase = ty * targetRowBytes
        for (let tx = 0; tx < targetWidth; tx++) {
            if (counts[tx] >= INK_COVERAGE * rows * span[tx]) {
                if (inkIsOne) out[outBase + (tx >> 3)] |= 0x80 >> (tx & 7)
                else out[outBase + (tx >> 3)] &= ~(0x80 >> (tx & 7))
            }
        }
    }
    return out
}

/** Downsample 8-bit greyscale or RGB samples by averaging the pixels under each target pixel. */
function downsampleContone(
    src: Uint8Array,
    width: number,
    height: number,
    components: number,
    targetWidth: number,
    targetHeight: number,
): Uint8Array {
    const { columnOf, span } = mapColumns(width, targetWidth)
    const out = new Uint8Array(targetWidth * targetHeight * components)
    const sums = new Uint32Array(targetWidth * components)

    let sy = 0
    for (let ty = 0; ty < targetHeight; ty++) {
        const end = ty === targetHeight - 1 ? height : Math.floor(((ty + 1) * height) / targetHeight)
        const rows = end - sy
        sums.fill(0)

        for (; sy < end; sy++) {
            let s = sy * width * components
            for (let x = 0; x < width; x++) {
                const t = columnOf[x] * components
                for (let c = 0; c < components; c++) sums[t + c] += src[s++]
            }
        }

        const outBase = ty * targetWidth * components
        for (let tx = 0; tx < targetWidth; tx++) {
            const area = rows * span[tx]
            for (let c = 0; c < components; c++) {
                out[outBase + tx * components + c] = Math.round(sums[tx * components + c] / area)
            }
        }
    }
    return out
}

/** Pixel size and component count from a JPEG's frame header. */
export function readJpegFrame(jpeg: Uint8Array): { width: number; height: number; components: number } | null {
    if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null
    let i = 2
    while (i + 9 < jpeg.length) {
        if (jpeg[i] !== 0xff) return null
        const marker = jpeg[i + 1]
        if (marker === 0xff) { i++; continue }
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue }

        const length = (jpeg[i + 2] << 8) | jpeg[i + 3]
        const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
        if (isFrame) {
            return {
                height: (jpeg[i + 5] << 8) | jpeg[i + 6],
                width: (jpeg[i + 7] << 8) | jpeg[i + 8],
                components: jpeg[i + 9],
            }
        }
        if (marker === 0xda || length < 2) return null
        i += 2 + length
    }
    return null
}

/** The pixel size an image should be cut down to, or null when it's already reasonable. */
function targetSize(width: number, height: number, box: PrintBox, ppi: number): { width: number; height: number } | null {
    // Long edge against long edge: a page photographed sideways is drawn
    // rotated, and comparing width to width would make it look small. Then the
    // larger of the two ratios, so an image that only covers part of the page
    // keeps more pixels rather than fewer.
    const longIn = Math.max(box.widthIn, box.heightIn)
    const shortIn = Math.min(box.widthIn, box.heightIn)
    const scale = Math.max((longIn * ppi) / Math.max(width, height), (shortIn * ppi) / Math.min(width, height))
    if (!(scale > 0) || scale > MAX_SCALE) return null
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    }
}

/** Resample one image in place. Returns true when it was replaced. */
async function resampleImage(
    doc: PDFDocument,
    ref: PDFRef,
    box: PrintBox,
    options: Required<Pick<CompressPdfOptions, 'bilevelPpi' | 'contonePpi'>> & Pick<CompressPdfOptions, 'recodeJpeg'>,
): Promise<boolean> {
    const stream = doc.context.lookup(ref)
    if (!(stream instanceof PDFRawStream)) return false
    const dict = stream.dict

    const width = numberOf(dict, 'Width')
    const height = numberOf(dict, 'Height')
    if (!width || !height) return false

    const filterInfo = singleFilter(dict)
    if (!filterInfo) return false
    const { filter, parms } = filterInfo

    const mask = isImageMask(dict)
    const bitsPerComponent = mask ? 1 : numberOf(dict, 'BitsPerComponent')
    if (bitsPerComponent !== 1 && bitsPerComponent !== 8) return false

    const components = mask ? 1 : colorComponents(dict, bitsPerComponent)
    if (!components) return false

    // Colour-key masking names exact sample values as transparent; averaging
    // pixels would invent new values along every edge.
    if (dict.lookup(name('Mask')) instanceof PDFArray) return false

    const replace = (contents: Uint8Array, size: { width: number; height: number }, newFilter: string) => {
        dict.set(name('Width'), PDFNumber.of(size.width))
        dict.set(name('Height'), PDFNumber.of(size.height))
        dict.set(name('Filter'), name(newFilter))
        dict.delete(name('DecodeParms'))
        doc.context.assign(ref, PDFRawStream.of(dict, contents))
    }

    if (filter === '/DCTDecode') {
        if (!options.recodeJpeg || bitsPerComponent !== 8) return false
        // An inverted or remapped JPEG would need the same treatment after
        // re-encoding; they're rare enough to leave alone.
        if (dict.has(name('Decode'))) return false

        const frame = readJpegFrame(stream.contents)
        if (!frame || frame.components !== components) return false

        const size = targetSize(width, height, box, options.contonePpi)
        if (!size) return false

        const recoded = await options.recodeJpeg(stream.contents, size.width, size.height)
        if (!recoded || recoded.length > stream.contents.length * (1 - MIN_SAVINGS)) return false

        const recodedFrame = readJpegFrame(recoded)
        if (!recodedFrame) return false
        if (recodedFrame.components === 3 && components === 1) {
            // Canvas encoders always write three channels, even for a grey page.
            dict.set(name('ColorSpace'), name('DeviceRGB'))
        } else if (recodedFrame.components !== components) {
            return false
        }
        replace(recoded, { width: recodedFrame.width, height: recodedFrame.height }, 'DCTDecode')
        return true
    }

    if (filter !== '' && filter !== '/FlateDecode') return false

    const rowBytes = bitsPerComponent === 1 ? (width + 7) >> 3 : width * components
    if (rowBytes * height > MAX_DECODED_BYTES) return false

    const size = targetSize(width, height, box, bitsPerComponent === 1 ? options.bilevelPpi : options.contonePpi)
    if (!size) return false

    const samples = decodeSamples(stream.contents, filter, parms, rowBytes, height, bitsPerComponent === 1 ? 1 : components)
    if (!samples) return false

    const resampled = bitsPerComponent === 1
        ? downsampleBilevel(samples, width, height, size.width, size.height)
        : downsampleContone(samples, width, height, components, size.width, size.height)

    const encoded = zlibSync(resampled, { level: 9 })
    if (encoded.length > stream.contents.length * (1 - MIN_SAVINGS)) return false

    replace(encoded, size, 'FlateDecode')
    return true
}

/**
 * Let the browser paint and handle input now and then; a long PDF has many
 * images. A message channel rather than a timer, because browsers slow timers
 * to one a second in a background tab and the upload would crawl if the user
 * switched away.
 */
const pause = () => new Promise<void>((resolve) => {
    if (typeof MessageChannel === 'undefined') {
        setTimeout(resolve, 0)
        return
    }
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
        channel.port1.close()
        resolve()
    }
    channel.port2.postMessage(null)
})
const PAUSE_EVERY_MS = 50

export async function compressPdf(input: Uint8Array, options: CompressPdfOptions = {}): Promise<CompressPdfResult> {
    const untouched: CompressPdfResult = {
        bytes: input,
        compressed: false,
        originalSize: input.length,
        imagesResampled: 0,
    }

    let doc: PDFDocument
    try {
        // Encrypted and malformed files throw here and are passed through as-is.
        doc = await PDFDocument.load(input, { updateMetadata: false })
    } catch {
        return untouched
    }

    const settings = {
        recodeJpeg: options.recodeJpeg,
        bilevelPpi: options.bilevelPpi ?? DEFAULT_BILEVEL_PPI,
        contonePpi: options.contonePpi ?? DEFAULT_CONTONE_PPI,
    }

    let imagesResampled = 0
    let lastPause = Date.now()
    for (const [ref, box] of collectPageImages(doc)) {
        try {
            if (await resampleImage(doc, ref, box, settings)) imagesResampled++
        } catch {
            // One undecodable image shouldn't stop the rest from being compressed.
        }
        if (Date.now() - lastPause > PAUSE_EVERY_MS) {
            await pause()
            lastPause = Date.now()
        }
    }
    if (imagesResampled === 0) return untouched

    let bytes: Uint8Array
    try {
        bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false })
    } catch {
        return untouched
    }
    if (bytes.length > input.length * (1 - MIN_SAVINGS)) return untouched

    return { bytes, compressed: true, originalSize: input.length, imagesResampled }
}
