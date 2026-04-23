# Self-documenting API pattern (for AI agents)

A portable design pattern for any API that will be consumed by an AI agent. The core idea: **the API describes itself over HTTP, so the agent never needs a side-channel doc.** Update the reference once, and every agent talking to the API sees the new version on its next call.

This document is generic. It's written in the context of the piano studio agent API, but the pattern applies to any API — REST, RPC, internal, external, in any language.

---

## The pattern in one sentence

Expose an **unauthenticated** `GET` at the API's base path that returns the current reference documentation as `text/markdown`.

That's it. Everything below is variations and trade-offs.

---

## Why this works well for AI agents

- **LLMs parse markdown natively.** No custom schema, no JSON spec that needs a client library — the model reads `GET /api/agent` and immediately understands what's available.
- **One source of truth.** The markdown file in your repo *is* what the agent sees. You can't get out of sync because there is no second copy.
- **No manual doc hand-off.** You don't email / paste / re-upload docs every time the API changes. Push to main, and the discovery endpoint serves the new version.
- **Self-onboarding.** A fresh agent with only your base URL and a secret can bootstrap itself — step 1 is always "GET the root, read the doc, then proceed."
- **Chicken-and-egg-proof.** The discovery endpoint itself is unauthenticated, so the agent doesn't need to know the auth scheme *before* it can learn the auth scheme.

---

## Design rules

### 1. Put discovery at the base path, not a weird sub-path

```
GET /api/agent          ← docs (no auth)
GET /api/agent/students ← data (auth required)
```

If an agent fat-fingers the URL and hits the bare base, it gets *the doc that explains what to hit instead*. This turns a 404 into a teaching moment.

### 2. No auth on the doc endpoint

The doc describes *how to auth*. Gating it creates a chicken-and-egg problem. And the doc itself should never leak secrets or sensitive schema — it's a public surface description, same as any OpenAPI spec on any public API.

### 3. Return markdown, not JSON

Agents are LLMs. They read prose. A JSON schema forces them (or you) to map fields back into natural language. Markdown is what they already speak.

Exception: if you *also* have programmatic clients (SDKs, non-LLM consumers), add a parallel JSON endpoint — see "Extensions" below. But keep the markdown as the primary.

### 4. Keep the doc in your repo, served from disk

The doc file lives alongside your code in git. The route handler reads it at runtime. Benefits:
- Code review covers doc changes.
- Atomic deploys: code and doc ship together, always consistent.
- No external CMS, no Notion, no "where is the current version of this?"

### 5. Always have a fallback

If reading the file fails (wrong path, deploy issue, filesystem quirk), return a tiny hard-coded cheat sheet — not a 500. The agent should always get *something* useful.

### 6. Small cache window, not zero

`Cache-Control: public, max-age=60, s-maxage=60` is a good default. Long enough to absorb bursts, short enough that you never wait more than a minute for a doc update to propagate.

### 7. Write the doc for an agent, not a human developer

The doc is consumed by an LLM, so optimize accordingly:
- **Lead with auth** — first paragraph after the title should answer "how do I call this?"
- **List every endpoint with a curl example.** Agents pattern-match on examples.
- **Include a "suggested system prompt" block** at the bottom. Users copy that into their agent verbatim.
- **State constraints and invariants.** E.g. "dates are YYYY-MM-DD, studio-local". LLMs benefit from explicit rules.
- **Call out footguns.** E.g. "`is_read` is per-recipient, not a thread-level flag." This prevents the agent from making plausible-but-wrong inferences.

---

## Reference implementation (Next.js 15 App Router)

```typescript
// app/api/agent/route.ts
import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

const FALLBACK = `# API
Discovery is online but the reference doc could not be loaded.
Auth: Authorization: Bearer <TOKEN>
See repo /docs for the canonical reference.`

export async function GET() {
    try {
        const md = await fs.readFile(
            path.join(process.cwd(), 'docs', 'agent-api.md'),
            'utf-8',
        )
        return new NextResponse(md, {
            status: 200,
            headers: {
                'Content-Type': 'text/markdown; charset=utf-8',
                'Cache-Control': 'public, max-age=60, s-maxage=60',
            },
        })
    } catch (err) {
        console.error('Docs read failed:', err)
        return new NextResponse(FALLBACK, {
            status: 200,
            headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        })
    }
}
```

### Equivalent in Express / Node

```javascript
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'

const app = express()

app.get('/api/agent', async (req, res) => {
    try {
        const md = await fs.readFile(path.join(process.cwd(), 'docs/agent-api.md'), 'utf-8')
        res.type('text/markdown').send(md)
    } catch {
        res.type('text/markdown').send('# API\nDocs unavailable; see repo.')
    }
})
```

### Equivalent in FastAPI (Python)

```python
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from pathlib import Path

app = FastAPI()

@app.get("/api/agent", response_class=PlainTextResponse)
def docs():
    try:
        return Path("docs/agent-api.md").read_text()
    except FileNotFoundError:
        return "# API\nDocs unavailable; see repo."
```

---

## Security considerations

- **The discovery endpoint is public.** Don't put anything in the doc you wouldn't put on a landing page: no internal URLs, no customer identifiers, no debug info, no fully-qualified private hostnames.
- **Keep all data endpoints authed.** The doc describes them; it does not replace gate-keeping.
- **Consider basic rate limiting** if your API is on a free tier or you worry about scraping. A handful of requests per IP per minute is plenty for legitimate agent use.
- **If the API itself is private** (internal tooling), you can put the whole thing behind a VPN/SSO — the discovery endpoint sits inside the same perimeter.

---

## Extensions worth considering

### Parallel JSON format

If you also have programmatic consumers, support content negotiation:

```
GET /api/agent                       → markdown (default)
GET /api/agent?format=json           → structured JSON summary
GET /api/agent  Accept: application/json → same
```

The JSON version can be auto-derived from the markdown (at build time) or hand-maintained, but **don't let them drift**. The markdown is the source of truth.

### OpenAPI spec

For a large API, publish `GET /api/agent/openapi.json` alongside the markdown. LLM agents usually don't need it, but SDK generators and IDE tools do.

### Versioning

For breaking changes, version the namespace: `/api/agent/v1`, `/api/agent/v2`. Each version has its own discovery endpoint with its own doc. Old agents keep working; new agents can migrate on their own schedule.

### "Who am I" / auth-probe

Add `GET /api/agent/whoami` (authenticated) that returns what the token is authorized to do. Useful for agents running in unfamiliar environments — they can confirm their credentials work before trying a mutation.

### Rate-limit headers

On authed endpoints, return `X-RateLimit-Remaining` and `X-RateLimit-Reset`. Agents can back off gracefully instead of hitting 429s.

---

## Checklist for a new API

When you spin up a new API and want it agent-ready:

- [ ] Write `docs/<name>-api.md` with: overview, auth, identifiers/formats, every endpoint with curl + response shape, error codes table, suggested system prompt block.
- [ ] Add an unauthed `GET /api/<namespace>` route that reads that markdown file and returns it as `text/markdown`.
- [ ] Include a hard-coded fallback payload for the case where the doc file can't be read.
- [ ] Set `Cache-Control: public, max-age=60`.
- [ ] Test it: `curl https://<host>/api/<namespace>` from a fresh terminal — you should see the full doc.
- [ ] In the agent's system prompt, include one line: *"At session start, GET `<base URL>` (no auth) for the current API reference."*

That's the whole pattern. Once it's in place, updating the API is a one-step process: edit the markdown, push. The agent picks up the change on its next call.
