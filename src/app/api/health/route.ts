import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    ok: true,
    name: "headless-perplexity",
    cometRequired: false,
    engine: "webui",
    hasSessionEnv: Boolean(process.env.PERPLEXITY_SESSION_TOKEN),
    hasOfficialKey: Boolean(process.env.PERPLEXITY_API_KEY),
  });
}
