# Bug Fix: Zoom Webhook Auto-Completing Lessons Without Credit Deduction

**Date**: 2026-05-21
**Affected students**: Edwin Guo, Nate Mahon (May 21 lessons)
**Symptom**: Lessons marked `completed` with `credit_snapshot_before: null` and `credit_snapshot: null`, causing the agent to skip credit deduction when logging notes.

---

## Root Cause

The Zoom webhook (`POST /api/webhooks/zoom/route.ts`) fires `recording.completed` after a Zoom call ends and a recording is available. It was doing a **raw Supabase update**:

```ts
.update({ video_url: sharedUrl, status: 'completed' })
```

This bypassed `logLessonCore` entirely, so:
- Status was set to `completed` ✅
- Credits were **not** deducted ❌
- `credit_snapshot_before` / `credit_snapshot` were **not** written ❌

When the agent later called `POST /api/agent/lessons/:id/log` to add notes, the old guard in `logLessonCore` was:

```ts
const isAlreadyCompleted = lesson.status === 'completed'
if (!isAlreadyCompleted) {
    // deduct credit
}
```

Since `status` was already `completed`, the deduction branch was skipped entirely — even though the credit was never actually charged.

## Timeline

- **22:42 UTC**: Edwin and Nate's lessons were created
- **~UTC midnight**: Zoom sessions ended, `recording.completed` webhook fired → lessons marked `completed`, no credits deducted
- **03:04 UTC**: Agent logged notes → saw `status = completed`, skipped credit deduction
- **Result**: Both students kept 1 extra credit each

## Why This Happened (Not Caught Earlier)

Rob's lesson was earlier in the day and was still `scheduled` when the agent logged it, so the normal path ran. Edwin and Nate happened to have Zoom recordings processed by the webhook before the agent logged them — a timing edge case that only manifests when Zoom recordings finish before the teacher notes are logged.

## Failed Approaches

None — bug was identified in one pass by inspecting the Zoom webhook code directly.

## Final Fix

**Two-part architectural change** (commit `4ecb8b9`):

### 1. `logLessonCore` — 3-state credit guard

Instead of a binary `isAlreadyCompleted` flag, the function now reads `credit_snapshot_before` and `credit_snapshot` from the DB and determines state:

| Status | Snapshots | Action |
|--------|-----------|--------|
| `scheduled` | (always null) | Normal deduct + snapshot |
| `completed` | present | True no-op — already charged |
| `completed` | **null** | **Repair** — deduct + write snapshots |

Returns `credit_repaired: true` in the repair case so the agent can report it.

### 2. Zoom webhook — routes through `logLessonCore`

Instead of a raw `.update({ status: 'completed' })`, the webhook now:
1. Writes `video_url` first (so recording is persisted regardless of credit outcome)
2. Calls `logLessonCore` with `notes: ''` so the same credit deduction + snapshot path runs

This means future Zoom-autocompleted lessons will always have proper credit records. Teachers can still log notes later via the agent — the repair logic handles the case where notes were added after Zoom fired.

### 3. Agent `/log` endpoint

`credit_repaired` is now surfaced in the API response so the agent can detect and explicitly report repairs to the user.

## Correction Applied to Edwin & Nate

Manual credit correction needed for the May 21 incident (Zoom webhook ran before the fix was deployed):
- Edwin Guo: 4 → 3 credits
- Nate Mahon: 6 → 5 credits
