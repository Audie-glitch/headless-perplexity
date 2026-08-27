import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorToPayload } from "@/lib/perplexity";
import { askAction, healthAction, mintAction, modelsAction, sessionAction } from "./actions";

function textResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

function catchResult(error: unknown) {
  return textResult(errorToPayload(error), true);
}

export function createMcpServer() {
  const server = new McpServer({
    name: "headless-perplexity",
    version: "0.1.0",
  });

  server.registerTool(
    "perplexity_health",
    {
      title: "Health",
      description: "Check that the unofficial WebUI bridge is up. Comet is not required.",
    },
    async () => textResult(healthAction()),
  );

  server.registerTool(
    "perplexity_models",
    {
      title: "List models",
      description: "List WebUI model ids this server can send to perplexity_ask.",
    },
    async () => textResult(modelsAction()),
  );

  server.registerTool(
    "perplexity_session",
    {
      title: "Session",
      description: "GET Perplexity /api/auth/session using optional cookies or PERPLEXITY_COOKIES.",
      inputSchema: {
        cookies: z.string().optional().describe("Whole perplexity.ai Cookie header"),
      },
    },
    async ({ cookies }) => {
      try {
        return textResult(await sessionAction({ cookies }));
      } catch (error) {
        return catchResult(error);
      }
    },
  );

  server.registerTool(
    "perplexity_ask",
    {
      title: "Ask Perplexity",
      description:
        "Ask Perplexity through the public WebUI (POST /rest/sse/perplexity_ask). No Comet. Prefer a whole cookie header.",
      inputSchema: {
        query: z.string().describe("Question to ask"),
        model: z.string().optional().describe("Model id, default perplexity/best"),
        sources: z
          .array(z.enum(["web", "scholar", "social"]))
          .optional()
          .describe("Search sources"),
        cookies: z.string().optional().describe("Whole perplexity.ai Cookie header"),
      },
    },
    async ({ query, model, sources, cookies }) => {
      try {
        return textResult(await askAction({ query, model, sources, cookies }));
      } catch (error) {
        return catchResult(error);
      }
    },
  );

  server.registerTool(
    "perplexity_mint",
    {
      title: "Mint account",
      description:
        "Mint a free Perplexity session via Emailnator plus official email sign-in, or redeem a callback URL. Unofficial. Does not grant Pro.",
      inputSchema: {
        emailnatorCookies: z
          .string()
          .optional()
          .describe("emailnator.com Cookie header including XSRF-TOKEN"),
        callbackUrl: z
          .string()
          .optional()
          .describe("Perplexity /api/auth/callback/email URL from the sign-in email"),
      },
    },
    async ({ emailnatorCookies, callbackUrl }) => {
      try {
        return textResult(await mintAction({ emailnatorCookies, callbackUrl }));
      } catch (error) {
        return catchResult(error);
      }
    },
  );

  return server;
}
