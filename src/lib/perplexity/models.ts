import { DEFAULT_MODEL_ID } from "./constants";
import { ValidationError } from "./errors";
import type { AccountTier, PerplexityModel, SearchMode } from "./types";

export const MODELS: PerplexityModel[] = [
  {
    id: "perplexity/best",
    name: "Best",
    description: "Adapts to the query. Works for anonymous and free sessions.",
    identifier: "turbo",
    identifierByTier: { free: "turbo", pro: "pplx_pro_upgraded", max: "pplx_pro_upgraded" },
    mode: "copilot",
    minTier: "free",
    provider: "perplexity",
    status: "available",
  },
  {
    id: "perplexity/auto",
    name: "Auto (concise)",
    description: "Anonymous-friendly concise mode used by earlier unofficial clients.",
    identifier: "turbo",
    mode: "concise",
    minTier: "free",
    provider: "perplexity",
    status: "available",
  },
  {
    id: "perplexity/pro",
    name: "Pro",
    description: "Perplexity Pro search. Requires a signed-in Pro session.",
    identifier: "pplx_pro",
    mode: "copilot",
    minTier: "pro",
    provider: "perplexity",
    status: "available",
  },
  {
    id: "perplexity/reasoning",
    name: "Reasoning",
    description: "Step-by-step reasoning. Requires a signed-in Pro session.",
    identifier: "pplx_reasoning",
    mode: "copilot",
    minTier: "pro",
    provider: "perplexity",
    status: "available",
  },
  {
    id: "perplexity/deep-research",
    name: "Deep research",
    description: "Longer research runs. Requires a signed-in Pro session.",
    identifier: "pplx_alpha",
    mode: "research",
    minTier: "pro",
    provider: "perplexity",
    status: "available",
  },
  {
    id: "perplexity/sonar-2",
    name: "Sonar 2",
    description: "Perplexity in-house model.",
    identifier: "experimental",
    mode: "copilot",
    minTier: "pro",
    provider: "perplexity",
    status: "available",
  },
  {
    id: "openai/gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    description: "OpenAI versatile model via Perplexity WebUI.",
    identifier: "gpt56_terra",
    mode: "copilot",
    minTier: "pro",
    provider: "openai",
    status: "available",
  },
  {
    id: "openai/gpt-5.6-terra-thinking",
    name: "GPT-5.6 Terra Thinking",
    description: "OpenAI versatile model with thinking.",
    identifier: "gpt56_terra_thinking",
    mode: "copilot",
    minTier: "pro",
    provider: "openai",
    status: "available",
  },
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    description: "Anthropic Sonnet via Perplexity WebUI.",
    identifier: "claude50sonnet",
    mode: "copilot",
    minTier: "pro",
    provider: "anthropic",
    status: "available",
  },
  {
    id: "anthropic/claude-sonnet-5-thinking",
    name: "Claude Sonnet 5 Thinking",
    description: "Anthropic Sonnet with thinking.",
    identifier: "claude50sonnetthinking",
    mode: "copilot",
    minTier: "pro",
    provider: "anthropic",
    status: "available",
  },
  {
    id: "google/gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    description: "Google Gemini via Perplexity WebUI.",
    identifier: "gemini37flash",
    mode: "copilot",
    minTier: "pro",
    provider: "google",
    status: "available",
  },
  {
    id: "x-ai/grok-4.6",
    name: "Grok 4.6",
    description: "xAI Grok via Perplexity WebUI.",
    identifier: "grok46low",
    mode: "copilot",
    minTier: "pro",
    provider: "x-ai",
    status: "available",
  },
];

const MODE_ALIASES: Record<SearchMode, string> = {
  auto: "perplexity/auto",
  pro: "perplexity/pro",
  reasoning: "perplexity/reasoning",
  research: "perplexity/deep-research",
};

export function listModels(): PerplexityModel[] {
  return MODELS;
}

export function resolveModel(modelId?: string, mode?: SearchMode): PerplexityModel {
  if (!modelId && mode) {
    return resolveModel(MODE_ALIASES[mode]);
  }

  const id = modelId || DEFAULT_MODEL_ID;
  const match = MODELS.find((model) => model.id === id);
  if (match) {
    return match;
  }

  if (id.startsWith("custom:")) {
    const identifier = id.slice("custom:".length).trim();
    if (!identifier) {
      throw new ValidationError("custom: models need an internal identifier");
    }
    return {
      id,
      name: `Custom (${identifier})`,
      description: "User-supplied Perplexity internal model identifier.",
      identifier,
      mode: "copilot",
      minTier: "unknown",
      provider: "custom",
      status: "unknown",
    };
  }

  const available = MODELS.map((model) => model.id).join(", ");
  throw new ValidationError(`Unknown model ${id}. Available: ${available}`);
}

export function identifierForTier(model: PerplexityModel, tier: AccountTier): string {
  return model.identifierByTier?.[tier] ?? model.identifier;
}

export function officialModelFor(model: PerplexityModel): string {
  if (model.mode === "research" || model.id.includes("deep-research")) {
    return "sonar-deep-research";
  }
  if (model.id.includes("reasoning") || model.identifier.includes("reasoning")) {
    return "sonar-reasoning";
  }
  if (model.minTier === "pro" || model.minTier === "max") {
    return "sonar-pro";
  }
  return "sonar";
}
