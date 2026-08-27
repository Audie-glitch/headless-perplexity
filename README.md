# Headless Perplexity

Unofficial HTTP API and playground for [Perplexity](https://www.perplexity.ai) that talks to the public WebUI. It does **not** require the Comet browser, Chrome DevTools Protocol, or Perplexity connector OAuth.

This is a research-informed reimplementation, not a fork. It follows the same WebUI path used by public unofficial clients:

1. Optional session cookie (`__Secure-next-auth.session-token`)
2. Warm-up `GET /search/new`
3. Streaming `POST /rest/sse/perplexity_ask`
4. Parse both the older `text` SSE payload and the newer schematized `workflow_block` / JSON Patch stream

Comet MCP bridges are out of scope. Account generation and rate-limit bypass are intentionally not implemented.

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
| WebUI session | Paste a full `perplexity.ai` cookie string (preferred, includes `cf_clearance`) or just `__Secure-next-auth.session-token`. Send `x-perplexity-cookies`, `Authorization: Bearer <token>`, or set `PERPLEXITY_SESSION_TOKEN` / `PERPLEXITY_COOKIES`. |
| Official fallback | Set `PERPLEXITY_API_KEY`. Used only when the unofficial WebUI path returns 401/403. |

Session tokens are bearer credentials. Keep them out of git, shell history, and any host bound to `0.0.0.0`.

## HTTP API

### `POST /api/ask`

```bash
curl -N http://127.0.0.1:43147/api/ask \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_SESSION_TOKEN' \
  -d '{
    "query": "What is DNS over HTTPS?",
    "model": "perplexity/best",
    "sources": ["web"],
    "stream": true
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
  -H 'authorization: Bearer YOUR_SESSION_TOKEN' \
  -d '{
    "model": "perplexity/best",
    "messages": [{"role": "user", "content": "Summarize QUIC"}]
  }'
```

### Other routes

- `GET /api/health` — process status, whether env credentials are present
- `GET /api/session` — `GET https://www.perplexity.ai/api/auth/session`
- `GET /api/v1/models` — registered WebUI model ids

## What this is not

- Not an official Perplexity SDK
- Not a Comet controller
- Not a connector OAuth implementation
- Not a way to mint accounts or dodge query limits

Perplexity can change the WebUI contract at any time. Cloudflare often blocks datacenter IPs even with a valid session cookie, because clearance is bound to IP, user agent, and TLS fingerprint.

## Prior art

Studied, not vendored:

- [helallao/perplexity-ai](https://github.com/helallao/perplexity-ai) — Python WebUI wrapper and SSE ask client
- [Villoh/tunnel-agent](https://github.com/Villoh/tunnel-agent) — desktop manager for local engines, including Perplexity sessions
- [henrique-coder/perplexity-webui-scraper](https://github.com/henrique-coder/perplexity-webui-scraper) — current WebUI payload, search-init, and schematized stream format
- Community Comet MCP bridges — CDP control of an already-open Comet window; unused here

## License

MIT. Use at your own risk and follow Perplexity's terms.
