const BASE = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:43147";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function json(path: string, init?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }
  return { status: response.status, body, text, headers: response.headers };
}

function messageOf(body: unknown): string {
  if (!body || typeof body !== "object") {
    return String(body);
  }
  const record = body as { error?: { message?: string } | string; message?: string };
  if (typeof record.error === "string") {
    return record.error;
  }
  return record.error?.message ?? record.message ?? JSON.stringify(body).slice(0, 180);
}

async function main() {
const health = await json("/api/health");
record("GET /api/health", health.status === 200 && (health.body as { ok?: boolean }).ok === true, String(health.status));

const models = await json("/api/v1/models");
record(
  "GET /api/v1/models",
  models.status === 200 && Array.isArray((models.body as { data?: unknown[] }).data),
  String(models.status),
);

const session = await json("/api/session");
record("GET /api/session", session.status === 200 || session.status === 403 || session.status === 502, `${session.status} ${messageOf(session.body)}`);

const emptyAsk = await json("/api/ask", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "", stream: false }),
});
record("POST /api/ask empty query", emptyAsk.status === 400, `${emptyAsk.status} ${messageOf(emptyAsk.body)}`);

const emptyChat = await json("/api/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages: [] }),
});
record("POST /api/v1/chat/completions empty messages", emptyChat.status === 400, `${emptyChat.status} ${messageOf(emptyChat.body)}`);

const mintEmpty = await json("/api/mint", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
record("POST /api/mint empty", mintEmpty.status === 400, `${mintEmpty.status} ${messageOf(mintEmpty.body)}`);

const mintXsrf = await json("/api/mint", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ emailnatorCookies: "emailnator_session=only" }),
});
record("POST /api/mint missing XSRF", mintXsrf.status === 400, `${mintXsrf.status} ${messageOf(mintXsrf.body)}`);

const mintLive = await json("/api/mint", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ emailnatorCookies: "XSRF-TOKEN=fake-token; emailnator_session=test" }),
});
record(
  "POST /api/mint live Emailnator",
  mintLive.status === 502 && /419|403|Cloudflare|Emailnator/.test(messageOf(mintLive.body)),
  `${mintLive.status} ${messageOf(mintLive.body)}`,
);

const askLive = await json("/api/ask", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "What is DNS over HTTPS?", model: "perplexity/best", stream: false }),
});
record(
  "POST /api/ask live WebUI",
  askLive.status === 200 || askLive.status === 403 || askLive.status === 401,
  `${askLive.status} ${messageOf(askLive.body)}`.slice(0, 200),
);

const chatLive = await json("/api/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model: "perplexity/best",
    messages: [{ role: "user", content: "One word: DoH" }],
  }),
});
record(
  "POST /api/v1/chat/completions live",
  chatLive.status === 200 || chatLive.status === 403 || chatLive.status === 401,
  `${chatLive.status} ${messageOf(chatLive.body)}`.slice(0, 200),
);

const mcpInit = await json("/api/mcp", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "verify-api", version: "0.1.0" },
    },
  }),
});
const mcpSession = mcpInit.headers.get("mcp-session-id") ?? "";
const initOk =
  mcpInit.status === 200 &&
  typeof mcpInit.body === "object" &&
  mcpInit.body !== null &&
  "result" in mcpInit.body;
record(
  "POST /api/mcp initialize",
  initOk,
  `${mcpInit.status} session=${mcpSession || "none"} ${mcpInit.text.slice(0, 120)}`,
);

const mcpHeaders: Record<string, string> = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};
if (mcpSession) {
  mcpHeaders["mcp-session-id"] = mcpSession;
}

const mcpTools = await json("/api/mcp", {
  method: "POST",
  headers: mcpHeaders,
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
});
const toolNames =
  typeof mcpTools.body === "object" && mcpTools.body !== null
    ? ((mcpTools.body as { result?: { tools?: Array<{ name: string }> } }).result?.tools ?? []).map((tool) => tool.name)
    : [];
record(
  "POST /api/mcp tools/list",
  ["perplexity_ask", "perplexity_mint", "perplexity_health"].every((name) => toolNames.includes(name)),
  toolNames.join(", ") || `${mcpTools.status} ${mcpTools.text.slice(0, 160)}`,
);

const mcpHealth = await json("/api/mcp", {
  method: "POST",
  headers: mcpHeaders,
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "perplexity_health", arguments: {} },
  }),
});
record(
  "POST /api/mcp tools/call perplexity_health",
  mcpHealth.status === 200 && /riptide/.test(mcpHealth.text),
  `${mcpHealth.status} ${mcpHealth.text.slice(0, 160)}`,
);

const failed = checks.filter((check) => !check.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} API checks passed`);
if (failed.length) {
  process.exit(1);
}
}

void main();
