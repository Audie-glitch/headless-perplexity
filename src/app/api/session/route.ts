import { NextResponse } from "next/server";
import { clientOptionsFromRequest, errorToPayload, HeadlessPerplexity } from "@/lib/perplexity";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const client = new HeadlessPerplexity(clientOptionsFromRequest(request));

  try {
    const session = await client.session();
    return NextResponse.json({
      cometRequired: false,
      engine: "webui",
      session,
    });
  } catch (error) {
    const payload = errorToPayload(error);
    return NextResponse.json(
      {
        cometRequired: false,
        engine: "webui",
        error: payload,
      },
      { status: payload.status ?? 502 },
    );
  }
}
