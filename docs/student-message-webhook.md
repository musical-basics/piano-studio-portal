# Student Message Webhook Notification System

**Date Built:** 2026-05-28
**Author:** Lionel + Antigravity

## What this does

Whenever a student sends a new message to the admin (Lionel/Professor Williams), Piano Studio immediately POSTs a webhook payload to Commander/OpenClaw. This allows Commander/OpenClaw to notify Lionel immediately (e.g. via SMS or desktop notification) instead of constantly polling the database.

## Triggering Rules

1. **Inbound Only:** The webhook only triggers on inbound student -> admin messages. Admin replies or outgoing messages do not trigger the webhook.
2. **New Messages Only:** It only triggers at the moment a new message is successfully inserted into the database. Old messages are not processed.
3. **Best-Effort Delivery:**
   - Webhook delivery runs in a non-blocking `try-catch` block. If the target server is down, returns an error, or times out, the message creation is **not** aborted.
   - It enforces a short timeout of **5 seconds** so that it doesn't hang the client request.
   - Failures are logged clearly using `console.error`.

## Configuration

Add the following environment variables to your `.env.local` file:

```env
# The URL where the webhook should be sent
COMMANDER_MESSAGE_WEBHOOK_URL=http://localhost:3000/api/your-commander-webhook

# The secret token to authenticate the request
COMMANDER_MESSAGE_WEBHOOK_SECRET=your_commander_message_webhook_secret_key
```

## Payload and Authentication

### Webhook Headers

Every webhook POST request includes the following header to authenticate the payload:
- **`X-Piano-Studio-Webhook-Secret`**: The value of your configured `COMMANDER_MESSAGE_WEBHOOK_SECRET`.

### JSON Payload

The request body is a JSON object with the following structure:

```json
{
  "event": "piano_studio.message.created",
  "message": {
    "id": "uuid-of-the-message",
    "student_id": "uuid-of-the-student-sender",
    "student_name": "Emily Chen",
    "content": "Message content here...",
    "created_at": "2026-05-28T23:59:59.999Z"
  }
}
```

To avoid leaking unrelated student data, only these fields are sent.

## Testing the Webhook

A standalone integration test script is provided in `scripts/test_message_webhook.ts`.

To run the test:
```bash
pnpm tsx scripts/test_message_webhook.ts
```

This test:
1. Starts a temporary mock receiver HTTP server on port 3001.
2. Configures the environment to send webhooks to `http://localhost:3001/webhook`.
3. Finds the seeded student (`Emily Chen`) and admin (`Professor Williams`) in your Supabase database.
4. Programmatically sends a message from the student to the admin.
5. Captures the webhook request, asserts headers and payload shape.
6. Deletes the test message from the database to keep data clean.
7. Prints `SUCCESS` or details any errors.
