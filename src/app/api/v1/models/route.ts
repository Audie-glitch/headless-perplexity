import { NextResponse } from "next/server";
import { listModels } from "@/lib/perplexity";

export const runtime = "nodejs";

export function GET() {
  const created = Math.floor(Date.now() / 1000);
  return NextResponse.json({
    object: "list",
    data: listModels().map((model) => ({
      id: model.id,
      object: "model",
      created,
      owned_by: model.provider,
      name: model.name,
      description: model.description,
      mode: model.mode,
      min_tier: model.minTier,
      status: model.status,
    })),
  });
}
