import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { serve } from "@hono/node-server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSETransport } from "hono-mcp-server-sse-transport";
import { Hono } from "hono/quick";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import config from "./config.js";
import { DynamoDBStorageFactory } from "./dynamodb.js";
import { CognitoHandler } from "./oauth-handlers/cognito-handler.js";

const sseApp = new Hono();
const mcp = new McpServer({ name: "Demo", version: "1.0.0" });
mcp.tool(
  "add_plus_and_ten",
  "与えられた数値の足し算をする（さらに10を足す）",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b + 10) }],
  }),
);
const transports: Record<string, SSETransport> = {};

sseApp.get("/sse", (c) =>
  streamSSE(c, async (stream) => {
    const transport = new SSETransport("/sse/message", stream);
    transports[transport.sessionId] = transport;
    await mcp.connect(transport);

    stream.onAbort(() => {
      delete transports[transport.sessionId];
    });

    while (true) await stream.sleep(60_000);
  }),
);

sseApp.post("/sse/message", async (c) => {
  const id = c.req.query("sessionId");
  const t = id && transports[id];
  if (!t) return c.text("unknown sessionId", 400);
  return t.handlePostMessage(c);
});

export const apiHandler = {
  fetch: (req: Request, _env: any, ctx: any) => sseApp.fetch(req, ctx),
};

const dynamodb = new DynamoDBStorageFactory({
  tableName: config.oauthTableName,
});

const provider = new OAuthProvider({
  apiRoute: "/sse",
  // @ts-ignore
  apiHandler: apiHandler,
  // @ts-ignore
  defaultHandler: CognitoHandler,
  authorizeEndpoint: `${config.mcpServer}/authorize`,
  tokenEndpoint: `${config.mcpServer}/token`,
  clientRegistrationEndpoint: `${config.mcpServer}/register`,
  storageFactory: dynamodb,
});

serve({
  port: config.port,
  fetch: (req) =>
    provider.fetch(req, { OAUTH_KV: new Map() }, {
      waitUntil() {},
      passThroughOnException() {},
    } as any),
});

console.log(`🚀  running at http://localhost:${config.port}`);
