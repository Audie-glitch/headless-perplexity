import {
  completeMintFromLink,
  HeadlessPerplexity,
  mintAccount,
  MODELS,
  resolveEmailnatorCookies,
} from "@/lib/perplexity";
import type { AskResult, SourceFocus } from "@/lib/perplexity";

export interface AskActionInput {
  query: string;
  model?: string;
  sources?: SourceFocus[];
  cookies?: string;
  fetchImpl?: typeof fetch;
}

export async function askAction(input: AskActionInput): Promise<AskResult> {
  const client = new HeadlessPerplexity({
    rawCookieHeader: input.cookies?.trim() || process.env.PERPLEXITY_COOKIES?.trim(),
    sessionToken: process.env.PERPLEXITY_SESSION_TOKEN?.trim(),
    officialApiKey: process.env.PERPLEXITY_API_KEY?.trim(),
    fetchImpl: input.fetchImpl,
  });
  return client.ask({
    query: input.query,
    model: input.model,
    sources: input.sources,
  });
}

export async function sessionAction(input: { cookies?: string; fetchImpl?: typeof fetch }) {
  const client = new HeadlessPerplexity({
    rawCookieHeader: input.cookies?.trim() || process.env.PERPLEXITY_COOKIES?.trim(),
    sessionToken: process.env.PERPLEXITY_SESSION_TOKEN?.trim(),
    fetchImpl: input.fetchImpl,
  });
  return client.session();
}

export async function mintAction(input: {
  emailnatorCookies?: string;
  callbackUrl?: string;
  fetchImpl?: typeof fetch;
}) {
  if (input.callbackUrl?.trim()) {
    return completeMintFromLink(input.callbackUrl, input.fetchImpl);
  }
  const cookies = resolveEmailnatorCookies({ cookies: input.emailnatorCookies });
  if (!cookies) {
    throw new Error("emailnatorCookies or EMAILNATOR_COOKIES is required unless callbackUrl is set");
  }
  return mintAccount({
    emailnatorCookies: cookies,
    fetchImpl: input.fetchImpl,
  });
}

export function modelsAction() {
  return MODELS.map((model) => ({
    id: model.id,
    name: model.name,
    description: model.description,
    mode: model.mode,
    minTier: model.minTier,
  }));
}

export function healthAction() {
  return {
    ok: true,
    name: "headless-perplexity",
    cometRequired: false,
    engine: "webui",
    mcp: true,
    hasSessionEnv: Boolean(process.env.PERPLEXITY_SESSION_TOKEN || process.env.PERPLEXITY_COOKIES),
    hasOfficialKey: Boolean(process.env.PERPLEXITY_API_KEY),
    hasEmailnatorEnv: Boolean(process.env.EMAILNATOR_COOKIES),
  };
}
