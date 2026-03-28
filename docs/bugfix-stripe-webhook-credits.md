# Bug: Stripe Subscription Renewal Not Adding Credits

**Date Fixed:** 2026-03-27  
**Severity:** Critical (users charged without receiving credits)

## Symptom
A subscriber's auto-renewal charged via Stripe but 4 lesson credits were not added to their account.

## Root Cause
The Stripe webhook handler extracted the subscription ID via `(invoice as any).subscription`, which returns `undefined` in Stripe API version `2025-11-17.clover`. This caused `stripe.subscriptions.retrieve(undefined)` to throw, crashing the webhook handler.

Additionally, the original code had **no try-catch** around the business logic and always returned `200 { received: true }` regardless of success — so Stripe believed delivery succeeded and never retried.

## Failed Fixes

### Attempt 1: Add error handling + try-catch
- Wrapped all logic in try-catch, added `.error` checks on Supabase calls, returned 500 on failure
- **Result:** Still 500 — the catch block fired but only returned generic `"Webhook handler failed"` so we couldn't see the actual error

### Attempt 2: Surface error details in response
- Updated catch block to include `err.message` and `err.stack` in the 500 response body
- **Result:** Still 500, but now we could read the error in Stripe dashboard: `"subscription_exposed_id" must be a string, but got: undefined`

## Final Fix (Attempt 3)
Replaced `(invoice as any).subscription` with a multi-fallback extraction:

```typescript
if (typeof invoiceAny.subscription === 'string') {
    subscriptionId = invoiceAny.subscription
} else if (invoiceAny.subscription?.id) {
    subscriptionId = invoiceAny.subscription.id
} else if (invoiceAny.parent?.subscription_details?.subscription) {
    subscriptionId = invoiceAny.parent.subscription_details.subscription  // ← this is where it was
} else if (invoice.lines?.data?.[0]) {
    const lineAny = invoice.lines.data[0] as any
    subscriptionId = lineAny.subscription || lineAny.parent?.subscription_details?.subscription
}
```

## Why It Worked
Stripe API `2025-11-17.clover` moved the subscription reference from `invoice.subscription` to `invoice.parent.subscription_details.subscription`. The multi-fallback approach handles both old and new API versions.

## Key Takeaway
- Never assume Stripe field locations are stable across API versions
- Always return 500 on webhook failure so Stripe auto-retries
- Always check Supabase `.error` instead of fire-and-forget
