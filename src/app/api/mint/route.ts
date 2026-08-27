import { NextResponse } from "next/server";
import {
  completeMintFromLink,
  errorToPayload,
  mintAccount,
  resolveEmailnatorCookies,
} from "@/lib/perplexity";

export const runtime = "nodejs";
export const maxDuration = 120;

function readString(body: unknown, keys: string[]): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key];
    }
  }
  return undefined;
}

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const callbackUrl = readString(body, ["callbackUrl", "signInUrl", "link"]);
  if (callbackUrl) {
    try {
      const result = await completeMintFromLink(callbackUrl);
      return NextResponse.json(result);
    } catch (error) {
      const payload = errorToPayload(error);
      return NextResponse.json({ error: payload }, { status: payload.status ?? 502 });
    }
  }

  const cookies = resolveEmailnatorCookies({
    cookies: readString(body, ["emailnatorCookies", "cookies"]),
    request,
  });

  if (!cookies) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Emailnator cookies are required. Sign in at emailnator.com, copy the Cookie header, and send emailnatorCookies.",
          status: 400,
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await mintAccount({ emailnatorCookies: cookies });
    return NextResponse.json(result);
  } catch (error) {
    const payload = errorToPayload(error);
    return NextResponse.json({ error: payload }, { status: payload.status ?? 502 });
  }
}
