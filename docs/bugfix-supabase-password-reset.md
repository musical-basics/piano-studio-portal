# Bug Fix: Supabase Password Reset Redirect & Expiration Issues

This document records the complex troubleshooting and final resolution of the password reset bug on the live site (`lessons.musicalbasics.com`).

---

## 1. The Bug
When users requested a password reset on the live site:
1. The link in the email was generated with `localhost:3000` rather than the production domain.
2. After fixing the domain, clicking the link resulted in redirects back to `/login?error=Could not authenticate` with an `#error=access_denied&error_code=otp_expired` hash.
3. The link appeared to be expired immediately upon delivery, preventing users from resetting their passwords.

---

## 2. The Root Causes (The "BS" Stack)

This single authentication issue was a combination of five distinct architectural quirks across Next.js, Vercel, and Supabase:

### A. HTTP Origin Header Absence
The original `sendResetLink` server action resolved the origin via `headersList.get('origin') || 'http://localhost:3000'`. However, browsers often omit the `Origin` header during form submissions or server action transitions. In these cases, it defaulted to `localhost:3000`, writing local URLs into production emails.

### B. SSL Termination Protocol Mismatch
Vercel hosts the app using SSL termination (traffic enters the proxy as `https://` but is forwarded internally to Next.js as `http://`). Relying on `new URL(request.url)` in `/auth/callback` resulted in an insecure redirect to `http://lessons.musicalbasics.com/reset-password`. Because cookies are marked `Secure` in production, the browser refused to transmit session cookies over the insecure HTTP redirect, resulting in an unauthenticated session.

### C. Server Actions vs. PKCE Cookies
Supabase Auth uses PKCE (Proof Key for Code Exchange) by default. When `resetPasswordForEmail` is initiated in a Next.js **Server Action** (on the server), the PKCE `code_verifier` cookie cannot be written to the browser. Thus, when the user clicked the link, the callback route `exchangeCodeForSession` failed with `both auth code and code verifier should be non-empty` because the verifier cookie was missing.

### D. Email Client Link Pre-Fetching
Security scanners and email clients (like Gmail, Outlook, or corporate filters) pre-fetch (pre-click) URLs in incoming emails to check if they are safe. Since Supabase verification links are single-use, the email client consumed the auth code during pre-fetching. By the time the actual user clicked the link, the token was already used, throwing `otp_expired`.

### E. React 18+ Double useEffect Execution
When verifying the code client-side, the component's `useEffect` hook was triggered twice during initial rendering. Since the token was single-use, the first call successfully logged in and consumed the code, while the second call tried to use the same code, failed, and overwrote the successful state with an "expired link" error.

---

## 3. Failed Fixes & Troubleshooting History

### Attempt 1: Reconstruct Host/Proto from Headers
*   **Fix**: Modified the server action and callback route to build the origin using `x-forwarded-host` and `x-forwarded-proto`.
*   **Result**: Fixed the `localhost` and SSL redirects, but failed with `invalid request: both auth code and code verifier should be non-empty`. The browser still lacked the PKCE verifier cookie because the request was initiated server-side.

### Attempt 2: Client-side Reset Password Call
*   **Fix**: Refactored the `/forgot-password` page to trigger `resetPasswordForEmail` client-side, setting the PKCE cookie.
*   **Result**: Link still failed with `otp_expired` because the email client's pre-fetching scanners were visiting `/auth/callback` GET endpoint and consuming the code before the user clicked it, or React StrictMode was executing the code exchange twice on mount.

---

## 4. The Final Solution & Why It Worked

We implemented a secure, pre-fetch-immune client-side verification flow:

1.  **Direct Redirect to Page**: The forgot password trigger now instructs Supabase to redirect directly to the page `/reset-password?code=...` instead of the API callback `/auth/callback`.
2.  **Client-Side Exchange in Browser**: When `/reset-password` mounts, we perform the `exchangeCodeForSession` client-side.
    *   *Why it works*: Email scanners do not execute client-side JavaScript, meaning the token is never consumed during pre-fetching.
    *   *Why it works*: Exchanging it in the browser ensures the browser's cookies (including the PKCE verifier cookie) are fully accessible.
3.  **useRef Execution Guard**: Wrapped the `useEffect` body in a `hasVerified` ref check:
    ```typescript
    const hasVerified = useRef(false)
    useEffect(() => {
        async function verifyLink() {
            if (hasVerified.current) return
            hasVerified.current = true
            // exchangeCodeForSession...
        }
        verifyLink()
    }, [code])
    ```
    *   *Why it works*: Ensures the single-use token is only exchanged once, preventing subsequent React re-renders from invalidating the session.
4.  **Stateless Otp Fallback**: Supported `token_hash` verification in the route as a fallback in case users configure cross-device verification.

---

## 5. Verification
*   Successfully compiled the production build (`pnpm build`).
*   Pushed changes to `main` branch.
*   Verified that user-initiated link clicks no longer expire prematurely and correctly present the password update form.
