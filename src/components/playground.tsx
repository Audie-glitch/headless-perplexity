"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCookieJar, useEmailnatorJar } from "@/hooks/use-cookie-jar";
import {
  AlertCircle,
  BookOpen,
  Loader2,
  Radio,
  RotateCcw,
  Send,
  Shield,
  UserPlus,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MODELS } from "@/lib/perplexity/models";
import { inspectCookieJar, type CookieJarInfo } from "@/lib/perplexity/session";
import type { AskResult, SearchResult, SourceFocus } from "@/lib/perplexity/types";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SearchResult[];
  engine?: string;
  error?: string;
  pending?: boolean;
}

const SOURCE_OPTIONS: { id: SourceFocus; label: string }[] = [
  { id: "web", label: "Web" },
  { id: "scholar", label: "Scholar" },
  { id: "social", label: "Social" },
];

export function Playground() {
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("perplexity/best");
  const [sources, setSources] = useState<SourceFocus[]>(["web"]);
  const [stream, setStream] = useState(true);
  const { cookieJar, setCookieJar, persist, persistValue } = useCookieJar();
  const { emailnatorCookies, setEmailnatorCookies, persistEmailnator } = useEmailnatorJar();
  const [magicLink, setMagicLink] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{
    hasSessionEnv: boolean;
    hasOfficialKey: boolean;
    hasEmailnatorEnv: boolean;
  } | null>(null);
  const [cursor, setCursor] = useState<{
    backendUuid?: string | null;
    readWriteToken?: string | null;
  }>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/health")
      .then((response) => response.json())
      .then((payload) =>
        setHealth({
          hasSessionEnv: Boolean(payload.hasSessionEnv),
          hasOfficialKey: Boolean(payload.hasOfficialKey),
          hasEmailnatorEnv: Boolean(payload.hasEmailnatorEnv),
        }),
      )
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const cookieInfo = useMemo(() => inspectCookieJar(cookieJar), [cookieJar]);

  const authMode = useMemo(() => {
    if (cookieInfo.kind === "full") {
      return "Whole cookie";
    }
    if (cookieInfo.kind === "partial") {
      return "Partial cookie";
    }
    if (cookieInfo.kind === "session-token" || health?.hasSessionEnv) {
      return "Session token only";
    }
    if (health?.hasOfficialKey) {
      return "Official key fallback";
    }
    return "Anonymous";
  }, [cookieInfo.kind, health]);

  function toggleSource(source: SourceFocus) {
    setSources((current) => {
      if (current.includes(source)) {
        return current.filter((item) => item !== source);
      }
      return [...current, source];
    });
  }

  function resetThread() {
    setTurns([]);
    setCursor({});
    setError(null);
  }

  async function mint(body: Record<string, string>) {
    if (minting) {
      return;
    }

    persistEmailnator();

    setMinting(true);
    setMintError(null);
    setMintStatus("Requesting a disposable inbox and Perplexity sign-in email…");

    try {
      const response = await fetch("/api/mint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        email?: string;
        cookies?: string;
        error?: { message?: string } | string;
      };
      if (!response.ok || !payload.cookies) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.message || `Mint failed (${response.status})`;
        throw new Error(message);
      }
      persistValue(payload.cookies);
      setMintStatus(
        payload.email
          ? `Minted a session for ${payload.email}. It is now in Whole cookie.`
          : "Minted a session. It is now in Whole cookie.",
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Account mint failed.";
      setMintError(message);
      setMintStatus(null);
    } finally {
      setMinting(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text || busy) {
      return;
    }

    persist();

    const userTurn: ChatTurn = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    setTurns((current) => [
      ...current,
      userTurn,
      { id: assistantId, role: "assistant", content: "", pending: true },
    ]);
    setQuery("");
    setBusy(true);
    setError(null);

    const headers: Record<string, string> = { "content-type": "application/json" };
    const body = {
      query: text,
      model,
      sources: sources.length ? sources : ["web"],
      stream,
      followUp: cursor.backendUuid ? cursor : undefined,
      cookies: cookieJar.trim() || undefined,
    };

    try {
      if (stream) {
        await runStream(headers, body, assistantId);
      } else {
        await runOnce(headers, body, assistantId);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Request failed";
      setError(message);
      setTurns((current) =>
        current.map((turn) =>
          turn.id === assistantId ? { ...turn, pending: false, error: message } : turn,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function runOnce(
    headers: Record<string, string>,
    body: Record<string, unknown>,
    assistantId: string,
  ) {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as AskResult & {
      error?: { message: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message || `Ask failed (${response.status})`);
    }
    applyResult(assistantId, payload);
  }

  async function runStream(
    headers: Record<string, string>,
    body: Record<string, unknown>,
    assistantId: string,
  ) {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as { error?: { message: string } } | null;
      throw new Error(payload?.error?.message || `Ask failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const collected = { text: "", buffer: "", sources: [] as SearchResult[] };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      collected.buffer += decoder.decode(value, { stream: true });
      const chunks = collected.buffer.split("\n\n");
      collected.buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const line = chunk
          .split("\n")
          .find((item) => item.startsWith("data:"));
        if (!line) {
          continue;
        }
        const event = JSON.parse(line.slice(5).trim()) as {
          type: string;
          text?: string;
          sources?: SearchResult[];
          result?: AskResult;
          error?: { message: string };
        };
        if (event.type === "delta" && event.text) {
          collected.text += event.text;
          const snapshot = collected.text;
          setTurns((current) =>
            current.map((turn) =>
              turn.id === assistantId ? { ...turn, content: snapshot, pending: true } : turn,
            ),
          );
        }
        if (event.type === "sources" && event.sources) {
          collected.sources = event.sources;
        }
        if (event.type === "done" && event.result) {
          applyResult(assistantId, event.result);
          return;
        }
        if (event.type === "error") {
          throw new Error(event.error?.message || "Stream failed");
        }
      }
    }

    if (collected.text) {
      applyResult(assistantId, {
        answer: collected.text,
        chunks: [collected.text],
        sources: collected.sources,
        conversation: { backendUuid: null, readWriteToken: null },
        model,
        mode: "copilot",
        engine: "webui",
      });
    }
  }

  function applyResult(assistantId: string, result: AskResult) {
    setCursor(result.conversation);
    setTurns((current) =>
      current.map((turn) =>
        turn.id === assistantId
          ? {
              ...turn,
              content: result.answer || "No answer returned.",
              sources: result.sources,
              engine: result.engine,
              pending: false,
            }
          : turn,
      ),
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(232,196,104,0.08),_transparent_42%),linear-gradient(180deg,_oklch(0.16_0.025_250),_oklch(0.13_0.02_250))]">
      <header className="border-b border-white/10 px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
              Unofficial WebUI bridge
            </p>
            <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
              Headless Perplexity
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Query Perplexity over HTTP. No Comet browser, no Chrome DevTools
              Protocol, no connector OAuth. Paste a cookie jar or mint a free
              session through official email sign-in. Credentials stay on this machine.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{authMode}</Badge>
            <Badge variant="outline">Comet not required</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-6 md:grid-cols-[320px_minmax(0,1fr)] md:px-8">
        <Card className="h-fit border-white/10 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-base">Request</CardTitle>
            <CardDescription>
              Uses `/rest/sse/perplexity_ask` the same way the public unofficial
              WebUI clients do.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select value={model} onValueChange={(value) => value && setModel(value)}>
                <SelectTrigger id="model" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sources</Label>
              <div className="flex flex-wrap gap-2">
                {SOURCE_OPTIONS.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={sources.includes(option.id) ? "default" : "outline"}
                    onClick={() => toggleSource(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="stream">Stream tokens</Label>
                <p className="text-xs text-muted-foreground">SSE from `/api/ask`</p>
              </div>
              <Switch id="stream" checked={stream} onCheckedChange={setStream} />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="token">Whole cookie</Label>
              <Textarea
                id="token"
                autoComplete="off"
                spellCheck={false}
                rows={6}
                placeholder="Paste the entire perplexity.ai cookie header here. Include cf_clearance, __cf_bm, and __Secure-next-auth.session-token."
                value={cookieJar}
                onChange={(event) => setCookieJar(event.target.value)}
              />
              <CookieStatus info={cookieInfo} />
              <p className="text-xs text-muted-foreground">
                Copy from Microsoft Edge: F12 → Network → any perplexity.ai
                request → Request Headers → cookie. Paste the entire value, not
                just the session token. Stored in sessionStorage only.
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="emailnator">Account minting</Label>
              <Textarea
                id="emailnator"
                autoComplete="off"
                spellCheck={false}
                rows={4}
                placeholder="Paste the emailnator.com Cookie header. Must include XSRF-TOKEN. Leave empty if EMAILNATOR_COOKIES is set on the server."
                value={emailnatorCookies}
                onChange={(event) => setEmailnatorCookies(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Opens emailnator.com, generates a Gmail-style address, calls
                Perplexity&apos;s official email sign-in, and stores the resulting
                session cookie here. Unofficial. Follow Perplexity&apos;s terms.
                {health?.hasEmailnatorEnv ? " Server already has EMAILNATOR_COOKIES." : ""}
              </p>
              <Button
                type="button"
                className="w-full"
                disabled={minting || (!emailnatorCookies.trim() && !health?.hasEmailnatorEnv)}
                onClick={() =>
                  void mint({
                    emailnatorCookies: emailnatorCookies.trim(),
                  })
                }
              >
                {minting ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <UserPlus data-icon="inline-start" />
                )}
                {minting ? "Minting" : "Mint account"}
              </Button>
              <Textarea
                id="magic-link"
                autoComplete="off"
                spellCheck={false}
                rows={3}
                placeholder="Or paste a Perplexity sign-in link from the email: https://www.perplexity.ai/api/auth/callback/email?…"
                value={magicLink}
                onChange={(event) => setMagicLink(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={minting || !magicLink.trim()}
                onClick={() => void mint({ callbackUrl: magicLink.trim() })}
              >
                Redeem sign-in link
              </Button>
              {mintStatus ? <p className="text-xs text-emerald-200/80">{mintStatus}</p> : null}
              {mintError ? <p className="text-xs text-destructive">{mintError}</p> : null}
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={resetThread}>
              <RotateCcw data-icon="inline-start" />
              Reset thread
            </Button>
          </CardContent>
        </Card>

        <div className="flex min-h-[70vh] flex-col gap-4">
          <Card className="flex min-h-0 flex-1 flex-col border-white/10 bg-card/80 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conversation</CardTitle>
              <CardDescription>
                Follow-ups reuse the WebUI `backend_uuid` when Perplexity returns one.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              <ScrollArea className="h-[48vh] pr-3">
                {turns.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="space-y-4">
                    {turns.map((turn) => (
                      <TurnCard key={turn.id} turn={turn} />
                    ))}
                    <div ref={bottomRef} />
                  </div>
                )}
              </ScrollArea>

              {error ? (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle />
                  <AlertTitle>Query failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <form onSubmit={onSubmit} className="mt-4 space-y-3">
                <Textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ask Perplexity without opening Comet…"
                  rows={3}
                  disabled={busy}
                />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {cursor.backendUuid
                      ? `Thread ${cursor.backendUuid.slice(0, 8)}…`
                      : "New thread"}
                  </p>
                  <Button type="submit" disabled={busy || !query.trim()}>
                    {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                    {busy ? "Asking" : "Ask"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Tabs defaultValue="api">
            <TabsList>
              <TabsTrigger value="api">HTTP API</TabsTrigger>
              <TabsTrigger value="openai">OpenAI compatible</TabsTrigger>
              <TabsTrigger value="notes">Limits</TabsTrigger>
            </TabsList>
            <TabsContent value="api">
              <CodeCard
                title="Native ask"
                body={`curl -N http://127.0.0.1:43147/api/ask \\
  -H 'content-type: application/json' \\
  -d '{"query":"What is DNS over HTTPS?","model":"perplexity/best","stream":true,"cookies":"YOUR_WHOLE_COOKIE"}'`}
              />
              <div className="mt-3">
                <CodeCard
                  title="Mint a session"
                  body={`curl http://127.0.0.1:43147/api/mint \\
  -H 'content-type: application/json' \\
  -d '{"emailnatorCookies":"XSRF-TOKEN=...; emailnator_session=..."}'`}
                />
              </div>
            </TabsContent>
            <TabsContent value="openai">
              <CodeCard
                title="Chat completions"
                body={`curl http://127.0.0.1:43147/api/v1/chat/completions \\
  -H 'content-type: application/json' \\
  -d '{"model":"perplexity/best","messages":[{"role":"user","content":"Summarize QUIC"}],"cookies":"YOUR_WHOLE_COOKIE"}'`}
              />
            </TabsContent>
            <TabsContent value="notes">
              <Card className="border-white/10">
                <CardContent className="space-y-2 pt-4 text-sm text-muted-foreground">
                  <p>This is unofficial. Perplexity can change the WebUI contract without notice.</p>
                  <p>Datacenter IPs are often blocked by Cloudflare. Paste the whole cookie header, including cf_clearance, not just the session token.</p>
                  <p>Account minting uses Emailnator plus Perplexity&apos;s official email sign-in. It is not a rate-limit bypass and does not grant Pro.</p>
                  <p>Do not expose this server beyond localhost unless you add your own auth.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function CookieStatus({ info }: { info: CookieJarInfo }) {
  if (info.kind === "empty") {
    return (
      <p className="text-xs text-amber-200/80">
        No cookie yet. A session token alone often fails Cloudflare. Paste the
        whole header.
      </p>
    );
  }

  if (info.kind === "session-token" || (info.hasSession && !info.hasClearance)) {
    return (
      <p className="text-xs text-amber-200/80">
        Session token detected, but cf_clearance is missing. Paste the whole
        cookie header.
      </p>
    );
  }

  return (
    <p className="text-xs text-emerald-200/80">
      {info.count} cookies
      {info.hasSession ? " · session" : ""}
      {info.hasClearance ? " · cf_clearance" : ""}
      {info.hasCfBm ? " · __cf_bm" : ""}
    </p>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex gap-2">
        <Badge variant="outline">
          <Radio data-icon="inline-start" />
          Headless
        </Badge>
        <Badge variant="outline">
          <Shield data-icon="inline-start" />
          Local tokens
        </Badge>
        <Badge variant="outline">
          <BookOpen data-icon="inline-start" />
          Citations
        </Badge>
      </div>
      <div className="space-y-2">
        <p className="text-lg font-medium">No thread yet</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Ask a question to hit Perplexity&apos;s public WebUI from this server.
          The first answer starts a conversation you can follow up on.
        </p>
      </div>
    </div>
  );
}

function TurnCard({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={`rounded-xl border border-white/10 p-4 ${isUser ? "bg-white/5" : "bg-black/20"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          {isUser ? "You" : "Perplexity"}
        </p>
        {turn.engine ? <Badge variant="secondary">{turn.engine}</Badge> : null}
        {turn.pending ? <Badge variant="outline">streaming</Badge> : null}
      </div>
      {turn.error ? (
        <p className="text-sm text-destructive">{turn.error}</p>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-6">
          {turn.content || (turn.pending ? "Waiting for the first token…" : "")}
        </p>
      )}
      {turn.sources?.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {turn.sources.slice(0, 6).map((source, index) => (
            <a
              key={`${source.url}-${index}`}
              href={source.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/10 p-3 text-left hover:bg-white/5"
            >
              <p className="text-sm font-medium">{source.title || source.url || "Source"}</p>
              {source.snippet ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{source.snippet}</p>
              ) : null}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CodeCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-6">
          <code>{body}</code>
        </pre>
      </CardContent>
    </Card>
  );
}
