import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    ok: true,
    name: "headless-perplexity",
    cometRequired: false,
    engine: "webui",
    mcpHttp: "/api/mcp",
    hasSessionEnv: Boolean(process.env.PERPLEXITY_SESSION_TOKEN || process.env.PERPLEXITY_COOKIES),
    hasOfficialKey: Boolean(process.env.PERPLEXITY_API_KEY),
    hasEmailnatorEnv: Boolean(process.env.EMAILNATOR_COOKIES),
    mcp: true,
  });
}
