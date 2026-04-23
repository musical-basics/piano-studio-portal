# Agent API

REST API for an AI agent to act on behalf of the studio admin: list students, message them, read replies, and schedule / reschedule / cancel lessons. Every mutating endpoint fires the same side-effects as the admin UI (Zoom meeting create/update/delete, Google Calendar event, Resend emails to student and admin).

## Base URL

- Production: `https://lessons.musicalbasics.com/api/agent`
- Local dev: `http://localhost:3000/api/agent`

## Authentication

Every request requires a Bearer token:

```
Authorization: Bearer <AGENT_API_SECRET>
```

The server reads `AGENT_API_SECRET` from env. Missing or wrong token → `401 Unauthorized`. Missing env var on the server → `500`.

The agent always acts as the single admin profile (`role='admin'`) — there is no actor switching.

## Identifiers and formats

- `student_id`, `lesson_id`: UUIDs (strings). Get them from `GET /students` or `GET /lessons`.
- `date`: `YYYY-MM-DD` (studio local date, Pacific time).
- `time`: `HH:MM` 24-hour (e.g. `"16:30"`, `"09:00"`).
- `duration`: integer minutes — typically `30`, `45`, or `60`. Defaults to `60` if omitted.
- All responses are JSON. Errors have shape `{ "error": "<message>" }`.

## Read/unread semantics

The `is_read` column on `messages` is a **per-recipient** flag: it tracks whether the row's `recipient_id` has read that row. Implications for the agent:

- An outbound admin message may appear with `is_read: false` — that only means the student hasn't opened it yet, not that the admin has anything unread. Ignore this for admin-side inbox logic.
- The admin's unread count is always scoped to inbound rows: `sender_id = student AND recipient_id = admin AND is_read = false`.
- `POST /messages/mark-read` only updates inbound rows (same filter). Calling it never touches outbound admin messages.
- For a clean admin-perspective view, use `GET /threads` instead of interpreting per-message `is_read` flags yourself.

## Endpoints

### `GET /students`

List all students (lightweight).

```bash
curl -H "Authorization: Bearer $AGENT_API_SECRET" \
  https://<your-domain>/api/agent/students
```

Response:
```json
{
  "students": [
    {
      "id": "uuid",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+1…",
      "credits": 4,
      "credits_total": 12,
      "balance_due": 0,
      "status": "active",
      "timezone": "America/Los_Angeles",
      "created_at": "2025-09-01T…"
    }
  ]
}
```

### `GET /students/:id`

Fetch one student plus their upcoming (non-cancelled, today-or-later) lessons.

```bash
curl -H "Authorization: Bearer $AGENT_API_SECRET" \
  https://<your-domain>/api/agent/students/<uuid>
```

Response:
```json
{
  "student": { "id": "uuid", "name": "...", "email": "...", "parent_email": "..." /* ... */ },
  "upcomingLessons": [
    { "id": "uuid", "date": "2026-04-28", "time": "16:00", "duration": 60, "status": "scheduled", "zoom_link": "https://…", "notes": null }
  ]
}
```

404 if the id isn't a student.

### `PATCH /students/:id`

Update a student's `status`. Body:

```json
{ "status": "active" }
```

Allowed values: `"active"` or `"inactive"`.

```bash
curl -X PATCH https://lessons.musicalbasics.com/api/agent/students/<uuid> \
  -H "Authorization: Bearer $AGENT_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"status":"inactive"}'
```

Response: `{ "student": { "id": "uuid", "status": "inactive", /* ... */ } }`
400 if `status` is missing/invalid. 404 if the id isn't a student.

### `GET /threads`

Admin-perspective summary of every student thread, one row per student. Use this to find who has unread messages, when the last exchange happened, and the preview text — without having to load each conversation.

```bash
curl -H "Authorization: Bearer $AGENT_API_SECRET" \
  https://lessons.musicalbasics.com/api/agent/threads
```

Response:
```json
{
  "threads": [
    {
      "student_id": "uuid",
      "student_name": "Jane Doe",
      "student_email": "jane@example.com",
      "has_unread_from_student": true,
      "unread_count": 2,
      "last_message_at": "2026-04-22T18:03:22Z",
      "last_message_preview": "Can we move Friday's lesson?",
      "last_message_from": "student"
    }
  ]
}
```

`unread_count` counts only inbound (student → admin) messages with `is_read = false`. `last_message_from` is `"student"`, `"admin"`, or `null` if the thread has no messages. Students with no messages yet are still included (with nulls).

### `GET /messages?student_id=<uuid>`

Full conversation between the admin and one student, oldest first.

```bash
curl -H "Authorization: Bearer $AGENT_API_SECRET" \
  "https://<your-domain>/api/agent/messages?student_id=<uuid>"
```

Response:
```json
{
  "messages": [
    {
      "id": "uuid",
      "sender_id": "uuid",
      "recipient_id": "uuid",
      "content": "Hi, can we move Friday's lesson?",
      "is_read": true,
      "attachments": null,
      "created_at": "2026-04-20T18:03:22Z"
    }
  ]
}
```

To tell who sent what, compare `sender_id` against the student id (everything else is from the admin).

### `POST /messages`

Send a message to a student (from the admin). Triggers an email notification to the student via Resend.

Body:
```json
{
  "student_id": "uuid",
  "content": "Hey Jane — confirming your lesson on Friday at 4pm.",
  "attachments": [
    { "type": "image", "url": "https://…", "name": "score.png", "size": 123456 }
  ]
}
```

`attachments` is optional; max 5 per message. Each item must be `{ type: "image" | "file", url, name, size }`.

```bash
curl -X POST https://<your-domain>/api/agent/messages \
  -H "Authorization: Bearer $AGENT_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"student_id":"<uuid>","content":"Hello from the agent"}'
```

201 on success. Returns the created message row.

### `POST /messages/mark-read`

Mark all unread messages *from* a specific student *to* the admin as read.

Body: `{ "student_id": "<uuid>" }`

```bash
curl -X POST https://<your-domain>/api/agent/messages/mark-read \
  -H "Authorization: Bearer $AGENT_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"student_id":"<uuid>"}'
```

Response: `{ "success": true }`

### `GET /lessons?from=YYYY-MM-DD&to=YYYY-MM-DD&student_id=<uuid>`

List non-cancelled lessons + studio events in a date range, joined with student info. All three query params are optional:
- `from` defaults to today
- `to` defaults to today + 60 days
- `student_id` filters to one student

```bash
curl -H "Authorization: Bearer $AGENT_API_SECRET" \
  "https://<your-domain>/api/agent/lessons?from=2026-04-22&to=2026-05-06"
```

Response:
```json
{
  "from": "2026-04-22",
  "to": "2026-05-06",
  "lessons": [
    {
      "id": "uuid", "student_id": "uuid", "date": "2026-04-25", "time": "16:00",
      "duration": 60, "status": "scheduled", "zoom_link": "https://…",
      "student": { "id": "uuid", "name": "Jane Doe", "email": "..." }
    }
  ],
  "events": [ /* studio-wide events with RSVPs */ ]
}
```

### `POST /lessons`

Schedule a new lesson. Runs:
1. Conflict check against all non-cancelled lessons in that slot (returns 400 if taken).
2. Creates a Zoom meeting via the Zoom API; falls back to the admin's static Zoom link if the API call fails.
3. Creates a Google Calendar event (non-blocking).
4. Emails both the student and admin (fire-and-forget).

Body:
```json
{
  "student_id": "uuid",
  "date": "2026-05-02",
  "time": "16:00",
  "duration": 60
}
```

```bash
curl -X POST https://<your-domain>/api/agent/lessons \
  -H "Authorization: Bearer $AGENT_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"student_id":"<uuid>","date":"2026-05-02","time":"16:00","duration":60}'
```

201 on success with `{ "lesson": {...}, "message": "Lesson scheduled for ..." }`.
400 on slot conflict or missing student.

### `PATCH /lessons/:id`

Reschedule an existing lesson. Runs the same conflict check (excluding itself), updates the row, updates the Zoom meeting in place, and emails the student.

Body:
```json
{ "date": "2026-05-03", "time": "17:00", "duration": 60 }
```

```bash
curl -X PATCH https://<your-domain>/api/agent/lessons/<lesson_id> \
  -H "Authorization: Bearer $AGENT_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-05-03","time":"17:00","duration":60}'
```

### `DELETE /lessons/:id`

Cancel a lesson. Deletes the row, deletes the Zoom meeting, sends cancellation email. Admin cancellation overrides the 24-hour window, so the agent can cancel any scheduled lesson without penalty.

```bash
curl -X DELETE https://<your-domain>/api/agent/lessons/<lesson_id> \
  -H "Authorization: Bearer $AGENT_API_SECRET"
```

Response: `{ "success": true, "refunded": false, "message": "Lesson cancelled." }`

Note: credits are not deducted at schedule time in this app — they're deducted when a lesson is *logged* (completed). So cancellation doesn't need a refund step.

## Error shape

All errors return JSON with an `error` string and an appropriate HTTP status:

```json
{ "error": "This time slot is already booked by another student." }
```

| Status | When |
|---|---|
| 400 | Invalid body, missing required field, slot conflict, student not found |
| 401 | Missing or wrong `Authorization: Bearer …` header |
| 404 | Student id not found on `GET /students/:id` |
| 500 | Server misconfig (missing env) or unexpected DB error |

## Typical agent flows

**Answer a student's message**
1. `GET /students` → pick the right `student_id` by name/email.
2. `GET /messages?student_id=…` → read history.
3. `POST /messages` → reply.
4. `POST /messages/mark-read` → clear unread badge.

**Reschedule on request**
1. `GET /lessons?student_id=…` → find the lesson to move.
2. `GET /lessons?from=…&to=…` → inspect the calendar around the proposed new slot for conflicts.
3. `PATCH /lessons/:id` → perform the reschedule (the server will also do its own conflict check).
4. `POST /messages` → confirm to the student.

**Schedule an ad-hoc lesson**
1. `GET /lessons?from=…&to=…` → check what's free.
2. `POST /lessons` → create it.

## Suggested system prompt for the agent

```
You are the piano studio's assistant. You act on behalf of the admin (Lionel).

API base: https://<your-domain>/api/agent
Auth: Authorization: Bearer <AGENT_API_SECRET>   (never echo the secret to the user)
All dates are YYYY-MM-DD, times are HH:MM 24h, times/dates are studio-local (Pacific).

Capabilities:
- List students: GET /students
- Update a student's status (active/inactive): PATCH /students/<id> {status}
- Thread inbox summary (admin perspective): GET /threads
- Read messages with a student: GET /messages?student_id=…
- Send a message: POST /messages {student_id, content}
- Mark a student's messages read: POST /messages/mark-read {student_id}
- View lessons: GET /lessons?from&to&student_id
- Schedule a lesson: POST /lessons {student_id, date, time, duration}
- Reschedule: PATCH /lessons/<id> {date, time, duration}
- Cancel: DELETE /lessons/<id>

Rules:
- Always confirm the student_id before sending or scheduling. Prefer exact match by name+email from GET /students.
- For inbox-style questions ("who has unread messages?", "who have I not replied to?"), prefer GET /threads over inspecting per-message is_read flags. The is_read column is per-recipient, so outbound admin messages with is_read: false do NOT indicate admin-side unread.
- Before scheduling or rescheduling, fetch the relevant date range with GET /lessons to avoid conflicts. The server will reject slot conflicts with HTTP 400.
- The admin is the sender of every message you send. Write in a warm, concise voice that matches the studio's existing style.
- Cancellation is immediate and emails the student — confirm with the user before calling DELETE unless they have already authorized it.
- Changing a student's status is a low-risk but visible action; confirm intent before calling PATCH /students/<id>.
- Never expose the bearer token or internal error traces to end users.
```

## Notes

- All side-effects (Zoom, Google Calendar, Resend emails) run server-side exactly as they do when the admin uses the UI. The agent does not and should not call those APIs directly.
- The API is read/write on production data. There is no staging mode or dry-run flag — treat every call as real.
- Rate limiting, per-agent keys, audit logs, and idempotency are not implemented in v1. Add them if/when you scale past a single trusted agent.
