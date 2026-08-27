# Headless Perplexity

Unofficial HTTP API and playground for [Perplexity](https://www.perplexity.ai) that talks to the public WebUI. It does **not** require the Comet browser, Chrome DevTools Protocol, or Perplexity connector OAuth.

This is a research-informed reimplementation, not a fork. It follows the same WebUI path used by public unofficial clients:

1. Optional session cookie (`__Secure-next-auth.session-token`)
2. Warm-up `GET /search/new`
3. Streaming `POST /rest/sse/perplexity_ask`
4. Parse both the older `text` SSE payload and the newer schematized `workflow_block` / JSON Patch stream

Comet MCP bridges are out of scope. Optional account minting uses Emailnator plus Perplexity's official email sign-in. It does not grant Pro and is not a rate-limit bypass.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The playground listens on [http://127.0.0.1:43147](http://127.0.0.1:43147).

```bash
npm test
npm run build
```

## Authentication

| Method | How |
| --- | --- |
| Anonymous | Omit a token. Free/auto queries may work from residential IPs. |
| Whole cookie (preferred) | Paste the entire `perplexity.ai` Cookie header (`document.cookie` or DevTools → Request Headers → `cookie`). Must include `__Secure-next-auth.session-token` and usually `cf_clearance` / `__cf_bm`. Send it as JSON `cookies`, `x-perplexity-cookies`, or `PERPLEXITY_COOKIES`. |
| Session token only | `__Secure-next-auth.session-token` via `Authorization: Bearer` or `PERPLEXITY_SESSION_TOKEN`. Often blocked by Cloudflare. |
| Official fallback | Set `PERPLEXITY_API_KEY`. Used only when the unofficial WebUI path returns 401/403. |
| Account minting | `POST /api/mint` with Emailnator cookies, or redeem a Perplexity email callback URL. |

Session tokens are bearer credentials. Keep them out of git, shell history, and any host bound to `0.0.0.0`.

## HTTP API

### `POST /api/ask`

```bash
curl -N http://127.0.0.1:43147/api/ask \
  -H 'content-type: application/json' \
  -d '{
    "query": "What is DNS over HTTPS?",
    "model": "perplexity/best",
    "sources": ["web"],
    "stream": true,
    "cookies": "cf_clearance=...; __Secure-next-auth.session-token=..."
  }'
```

Non-streaming body:

```json
{
  "query": "What is QUIC?",
  "model": "perplexity/best",
  "sources": ["web"],
  "followUp": {
    "backendUuid": "optional-thread-id",
    "readWriteToken": "optional-token"
  }
}
```

### `POST /api/v1/chat/completions`

OpenAI-compatible. Point any OpenAI SDK at `http://127.0.0.1:43147/api/v1`.

```bash
curl http://127.0.0.1:43147/api/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "perplexity/best",
    "messages": [{"role": "user", "content": "Summarize QUIC"}],
    "cookies": "cf_clearance=...; __Secure-next-auth.session-token=..."
  }'
```

### `POST /api/mint`

Mints a free Perplexity session through official email sign-in and a disposable [Emailnator](https://www.emailnator.com) inbox. You paste Emailnator cookies (must include `XSRF-TOKEN`) after that site's Cloudflare check. The server then:

1. `POST https://www.emailnator.com/generate-email` with `{ "email": ["googleMail"] }`
2. `GET /api/auth/session` and `GET /api/auth/csrf` on Perplexity
3. `POST /api/auth/signin/email` with the disposable address
4. Poll Emailnator `/message-list` for `Sign in to Perplexity`
5. Follow `https://www.perplexity.ai/api/auth/callback/email?...` and collect `Set-Cookie`

```bash
curl http://127.0.0.1:43147/api/mint \
  -H 'content-type: application/json' \
  -d '{"emailnatorCookies":"XSRF-TOKEN=...; emailnator_session=..."}'
```

Or redeem a sign-in link you already have:

```bash
curl http://127.0.0.1:43147/api/mint \
  -H 'content-type: application/json' \
  -d '{"callbackUrl":"https://www.perplexity.ai/api/auth/callback/email?token=..."}'
```

Server-side fallback: `EMAILNATOR_COOKIES` or `x-emailnator-cookies`. The playground Mint account button writes the returned cookie jar into Whole cookie.

This is unofficial and may violate Perplexity's terms. You are responsible for how you use it. Datacenter IPs often fail both Emailnator and Perplexity with Cloudflare 403. A minted `__Secure-next-auth.session-token` still needs a `cf_clearance` bound to this IP and user agent before `/api/ask` works from a server.

### MCP

This repo exposes the same WebUI tools over the Model Context Protocol. It is not a Comet MCP bridge.

Stdio (Cursor / Claude Desktop):

```bash
npm run mcp
```

```json
{
  "mcpServers": {
    "headless-perplexity": {
      "command": "npx",
      "args": ["tsx", "src/mcp/stdio.ts"],
      "cwd": "/absolute/path/to/headless-perplexity",
      "env": {
        "PERPLEXITY_COOKIES": "",
        "EMAILNATOR_COOKIES": ""
      }
    }
  }
}
```

Streamable HTTP: `POST http://127.0.0.1:43147/api/mcp`

Tools: `perplexity_ask`, `perplexity_mint`, `perplexity_session`, `perplexity_models`, `perplexity_health`.

### Other routes

- `GET /api/health` — process status, whether env credentials are present
- `GET /api/session` — `GET https://www.perplexity.ai/api/auth/session`
- `GET /api/v1/models` — registered WebUI model ids
- `POST /api/mcp` — Streamable HTTP MCP

Verify the local HTTP + MCP contract:

```bash
npm run verify:api
```

## What this is not

- Not an official Perplexity SDK
- Not a Comet controller
- Not a connector OAuth implementation
- Not a way to dodge query limits or mint Pro

Perplexity can change the WebUI contract at any time. Cloudflare often blocks datacenter IPs even with a valid session cookie, because clearance is bound to IP, user agent, and TLS fingerprint.

## Prior art

Studied, not vendored:

- [helallao/perplexity-ai](https://github.com/helallao/perplexity-ai) — Python WebUI wrapper and SSE ask client
- [Soliver84/perplexity-ai-PRO-FREE](https://github.com/Soliver84/perplexity-ai-PRO-FREE) — same wrapper plus Emailnator account generation. Protocol used for `/api/mint`.
- [yuki-20/PerplexiCode](https://github.com/yuki-20/PerplexiCode) — VS Code agent that pastes the whole Edge cookie header and uses a Chrome-like TLS fingerprint
- [Villoh/tunnel-agent](https://github.com/Villoh/tunnel-agent) — desktop manager for local engines, including Perplexity sessions
- [henrique-coder/perplexity-webui-scraper](https://github.com/henrique-coder/perplexity-webui-scraper) — current WebUI payload, search-init, and schematized stream format
- Community Comet MCP bridges — CDP control of an already-open Comet window; unused here

## License

MIT. Use at your own risk and follow Perplexity's terms.
