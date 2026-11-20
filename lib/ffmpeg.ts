import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { chmod, rename, stat, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

/**
 * ffmpeg for the portal's server code (classroom thumbnails #1095, clips #1094).
 *
 * Vercel functions have no ffmpeg, and bundling an 80 MB binary into the build
 * is fragile, so the first call on a fresh function downloads a pinned static
 * build (ffmpeg 7.0.2 for linux x64, with x264 and https input, from the
 * ffmpeg-static project's GitHub release), checks its SHA-256, and keeps it in
 * /tmp for the rest of that function's life (a few seconds, once). Local runs
 * use FFMPEG_PATH or the Mac's Homebrew ffmpeg.
 */

const BUILD = {
    url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz',
    sha256: 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa',
    path: '/tmp/ffmpeg-7.0.2',
}

let ready: Promise<string> | null = null

async function exists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).size > 0
    } catch {
        return false
    }
}

async function download(): Promise<string> {
    if (await exists(BUILD.path)) return BUILD.path
    const res = await fetch(BUILD.url, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`ffmpeg download: HTTP ${res.status}`)
    const gz = Buffer.from(await res.arrayBuffer())
    const sum = createHash('sha256').update(gz).digest('hex')
    if (sum !== BUILD.sha256) throw new Error('ffmpeg download: checksum mismatch, not used')
    const tmp = `${BUILD.path}.${process.pid}.part`
    await writeFile(tmp, gunzipSync(gz))
    await chmod(tmp, 0o755)
    await rename(tmp, BUILD.path)
    return BUILD.path
}

/** The ffmpeg to run: FFMPEG_PATH, the Mac's Homebrew one, or the pinned build on Linux. */
export async function ffmpegPath(): Promise<string> {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
    if (process.platform === 'darwin') return '/opt/homebrew/bin/ffmpeg'
    if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error(`no ffmpeg for ${process.platform}/${process.arch}`)
    ready ??= download().catch(err => {
        ready = null
        throw err
    })
    return ready
}

/** Runs ffmpeg; rejects with the end of its log when it fails or runs past the time limit. */
export async function runFfmpeg(args: string[], timeoutMs = 120_000): Promise<void> {
    const bin = await ffmpegPath()
    await new Promise<void>((resolve, reject) => {
        execFile(bin, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, _out, stderr) => {
            if (err) reject(new Error(`ffmpeg failed: ${(String(stderr || '').trim().split('\n').slice(-3).join(' ') || err.message).slice(0, 400)}`))
            else resolve()
        })
    })
}
