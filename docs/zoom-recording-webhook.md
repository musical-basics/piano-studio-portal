# Zoom Recording → Student Folder Pipeline

**Date Built:** 2026-05-04
**Author:** Lionel + Claude

## What this does

When a Zoom cloud recording for a scheduled lesson finishes processing, our webhook automatically:
1. Looks up the matching lesson row by `zoom_meeting_id`
2. Reads the student's per-profile Dropbox folder name
3. Downloads the `shared_screen_with_speaker_view.mp4` directly from Zoom
4. Uploads it into the right student folder in Dropbox via the Dropbox SDK (chunked upload session for files >150MB)
5. Creates a Dropbox shared link
6. Writes `video_url` and `status='completed'` onto the lesson row

The student dashboard's "Watch Recording" button then has a working link, no manual moving required.

## What it replaced

Previously a Vercel cron at `/api/cron/process-recordings` ran nightly at 10:00 UTC. It scanned the source folder where the third-party zBackup app dropped Zoom recordings, parsed folder names with a regex, name-matched to students, and moved folders. Two recurring failure modes:
- **Vercel function timeout.** The cron did all folders in one request with sequential Dropbox calls. Anything past the function's runtime cap (~60s on Pro at the time) got dropped silently until the next night.
- **Brittle name matching.** Used `profile.name === folderName` exact match. Any typo, alias, or display-name change silently failed for that student.

The cron route file was deleted and the entry removed from `vercel.json` in commit `bf319bf`.

## Architecture

### Database

Added `profiles.dropbox_recording_folder` (text, nullable) — see migration `supabase/migrations/20260504000000_profiles_dropbox_recording_folder.sql`. Stores the exact name of the Dropbox folder under `/Lesson Recordings/` for each student. Folder names in Dropbox are inconsistent ("Daniel Recordings", "Yakir Shimon Lesson Recordings", "Ila and Cordelia Recordings", just "Mohammed Habbab"), so we explicitly map per-profile rather than computing the name. Inactive students all point at the existing `Old Students Recordings` bucket.

`lessons.zoom_meeting_id` (already existed) is the join key between a Zoom recording and the lesson row. Populated by `scheduleLessonCore` in [lib/core/lessons.ts](../lib/core/lessons.ts) when a lesson is scheduled.

### Webhook route

[app/api/webhooks/zoom/route.ts](../app/api/webhooks/zoom/route.ts):
- Handles Zoom's URL-validation handshake (HMAC-SHA256 of `plainToken` with `ZOOM_WEBHOOK_SECRET_TOKEN`)
- Verifies `x-zm-signature` on every other event using `v0:{timestamp}:{rawBody}` HMAC
- Acks non-`recording.completed` events with 200 (so Zoom doesn't retry them)
- For `recording.completed`: looks up the lesson, picks the .mp4 from `recording_files`, calls helpers in [lib/zoom-recordings.ts](../lib/zoom-recordings.ts) to download + upload + write the DB
- `maxDuration = 300` (Vercel Pro) to comfortably handle ~250MB recordings
- **Idempotent**: skips if `lesson.video_url` is already set
- Returns 500 on transient failures (Zoom retries up to 3× with backoff); returns 200 on terminal decisions like "no matching lesson" or "no folder configured" so retries don't hammer

### Helper module

[lib/zoom-recordings.ts](../lib/zoom-recordings.ts) exports:
- `getDropboxClient()` — constructs the Dropbox SDK client. **Must pass `fetch: fetch.bind(globalThis)` explicitly** (see Bug 2 below).
- `pickPrimaryRecordingFile()` — chooses the right file from Zoom's `recording_files` array (prefers `shared_screen_with_speaker_view` MP4)
- `downloadFromZoom()` — fetches the .mp4 bytes. **Uses `?access_token=` query param, not `Authorization` header** (see Bug 1 below).
- `uploadBufferToDropbox()` — single-call upload for files ≤150MB, chunked upload session for larger
- `getOrCreateSharedLink()` — gets a Dropbox share link, handling the "already exists" case

## Zoom Marketplace configuration

Server-to-Server OAuth app **"Piano Studio Portal"** (the same app that already creates meetings):

**Scopes added:**
- `cloud_recording:read:list_user_recordings:admin` — so Zoom includes recording details in webhook payloads, and so the rescue script can list recordings via API

**Event Subscription:**
- Endpoint URL: `https://lessons.musicalbasics.com/api/webhooks/zoom`
- Event: `Recording → All Recordings have completed` (`recording.completed`)
- Receiver: All users in the account
- Validated and active

**Vercel env var:**
- `ZOOM_WEBHOOK_SECRET_TOKEN` — the per-app secret token Zoom shows under Event Subscriptions. Distinct from `ZOOM_CLIENT_SECRET`. Required to verify incoming webhook signatures.

## Two bugs hit during initial test, both fixed

### Bug 1: Cross-origin redirect strips Authorization header (commit `92d0a5a`)

**Symptom:** First test recording's webhook returned 500 in ~600ms. Logs showed "Downloading from Zoom..." → "Uploading to Dropbox..." → silence. The Dropbox upload failed but the actual error was hidden by Vercel CLI summarizing multi-line logs.

**Root cause:** Zoom's `download_url` returns `https://zoom.us/rec/download/...` which redirects to a regional CDN (`https://us04web.zoom.us/...`). Per the WHATWG fetch spec, Node.js's native `fetch` strips the `Authorization` header on cross-origin redirects. The redirected request hit the CDN without auth, got back a short HTML error page that passed `res.ok`, and the Dropbox SDK then choked on the garbage payload.

**Fix:** [lib/zoom-recordings.ts](../lib/zoom-recordings.ts) — pass `download_token` as `?access_token=` query parameter instead of an Authorization header. Query params survive redirects. Also added a sanity guard that throws a useful error if the downloaded body is suspiciously small (<1KB), so we don't pass garbage downstream and lose the error.

### Bug 2: Dropbox SDK can't find fetch in serverless bundle (commit `f6baabf`)

**Symptom:** Second test recording's webhook downloaded 2,092,427 bytes successfully, then failed during upload with `Processing error: this.fetch is not a function`.

**Root cause:** The Dropbox JS SDK (v10) tries to auto-detect a fetch implementation at construction time. Inside Next.js's serverless function bundle the auto-detection misfires. The same code path worked fine when run locally via `tsx` because tsx exposes globals to the imported module differently than Next's bundler.

**Fix:** Pass `fetch: fetch.bind(globalThis)` explicitly when constructing the Dropbox client. One-line change.

## Operational guide

### Normal flow (no human action needed)

1. Lesson is scheduled in the admin UI → meeting created with `auto_recording: 'cloud'` ([lib/zoom.ts](../lib/zoom.ts) line ~78)
2. Lionel runs the lesson and ends the meeting
3. Zoom processes the recording for ~10–30 minutes
4. `recording.completed` fires to the webhook
5. Recording lands in `/Lesson Recordings/{Student folder}/{YYYY-MM-DD} - Lesson - {meeting_id}.mp4`
6. `lessons.video_url` and `lessons.status='completed'` get written
7. Student dashboard's "Watch Recording" link works

### When something goes wrong

**Step 1 — pull recent webhook logs:**
```
vercel logs --no-follow --environment production --since 1h --query "webhooks/zoom" -j
```
Vercel's CLI summarizes multi-line logs aggressively, so you'll often only see the first line. Better to use the Vercel dashboard → Functions → `/api/webhooks/zoom` → click into a specific failed invocation to see the full log array (which the route returns in the JSON response body too).

**Step 2 — re-process a single recording manually:**
```
npx tsx scripts/process_recording_manually.ts <zoom_meeting_id>
```
This script:
- Looks up the lesson by `zoom_meeting_id`
- Calls Zoom REST API (`/v2/users/me/recordings`) to get the current download URL — does NOT use the webhook payload's `download_token`, so it works hours/days after the fact
- Runs the same upload + DB write the webhook does
- Idempotent unless `--force`

This is the "rescue tool" for any future webhook failure.

**Step 3 — sanity-check Dropbox folder mapping:**
```
npx tsx scripts/check_test_dropbox.ts
```
Or just inspect Dropbox at `/Lesson Recordings/`. Folder structure should be one folder per active student plus `Old Students Recordings`, `My Own Piano Lessons`, `Recital Recordings`, etc.

### Adding a new student

When a new student profile is created, you must populate `dropbox_recording_folder` for them, otherwise recordings will skip with "no dropbox folder configured":

1. Create a Dropbox folder under `/Lesson Recordings/` (convention: `{Student Name} Recordings`)
2. Update the profile in Supabase: `UPDATE profiles SET dropbox_recording_folder = '{Student Name} Recordings' WHERE id = '...'`

Or use [scripts/finalize_dropbox_mapping.ts](../scripts/finalize_dropbox_mapping.ts) as a starting point — it has the logic for fuzzy matching + creating folders.

## zBackup status

zBackup keeps running in parallel — Lionel chose to keep it as a redundant archive. It dumps recordings into its own folder (separate from `/Lesson Recordings/`), so there's no conflict with our webhook's writes. If Dropbox storage usage becomes a problem, zBackup can be disabled and the webhook becomes the single source of truth.

## Outstanding follow-ups

- **Rotate `ZOOM_CLIENT_SECRET`** — it was briefly visible in a screenshot during setup. Regenerate in Zoom Marketplace → App Credentials → update Vercel env var.
- **Confirm the prod webhook works end-to-end on a real lesson** — test was completed via the rescue script (which exercises the same helper code), but a fresh `recording.completed` event from Zoom hitting the webhook with both fixes deployed has not yet been confirmed in the wild. Watch the next real student lesson and verify.

## Files at a glance

| File | Purpose |
|---|---|
| [app/api/webhooks/zoom/route.ts](../app/api/webhooks/zoom/route.ts) | Webhook handler (URL validation + signature verify + recording.completed) |
| [lib/zoom-recordings.ts](../lib/zoom-recordings.ts) | Helpers: Dropbox client, file picker, download, chunked upload, share link |
| [supabase/migrations/20260504000000_profiles_dropbox_recording_folder.sql](../supabase/migrations/20260504000000_profiles_dropbox_recording_folder.sql) | Adds the per-profile folder column |
| [scripts/process_recording_manually.ts](../scripts/process_recording_manually.ts) | Rescue script — re-process a recording by meeting ID |
| [scripts/inspect_dropbox.ts](../scripts/inspect_dropbox.ts) | Read-only listing of `/Lesson Recordings/` |
| [scripts/finalize_dropbox_mapping.ts](../scripts/finalize_dropbox_mapping.ts) | One-time backfill: produces final per-profile folder mapping JSON |
| [scripts/apply_dropbox_mapping.ts](../scripts/apply_dropbox_mapping.ts) | One-time backfill: applies the mapping JSON to the profiles table |
