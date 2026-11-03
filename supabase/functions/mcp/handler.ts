import { createClient } from "@supabase/supabase-js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { type Config, tokenVerifier } from "./auth.ts";
import { NutrifitRepository } from "./repository.ts";
import { createServer } from "./server.ts";

export function createHandler(config: Config) {
  const verify = tokenVerifier(config);
  const metadata = `${config.resource}/.well-known/oauth-protected-resource`;
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const headers = new Headers({
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    });
    const respond = (body: unknown, status = 200) =>
      Response.json(body, { status, headers });
    const origin = request.headers.get("Origin");
    if (origin && !config.origins.includes(origin)) {
      return respond({ error: "Origin not allowed" }, 403);
    }
    if (origin) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Vary", "Origin");
    }
    headers.set(
      "Access-Control-Expose-Headers",
      "WWW-Authenticate, X-Request-Id",
    );
    if (request.method === "OPTIONS") {
      headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
      );
      headers.set("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
      return new Response(null, { status: 204, headers });
    }
    const path = new URL(request.url).pathname;
    if (
      path.endsWith("/.well-known/oauth-protected-resource") &&
      request.method === "GET"
    ) {
      return respond({
        resource: config.resource,
        authorization_servers: [`${config.supabaseUrl}/auth/v1`],
        scopes_supported: ["openid"],
        bearer_methods_supported: ["header"],
      });
    }
    const expectedPath = new URL(config.resource).pathname;
    if (path !== expectedPath && path !== `${expectedPath}/`) {
      return respond({ error: "Not found" }, 404);
    }
    if (!["POST", "GET", "DELETE"].includes(request.method)) {
      return respond({ error: "Method not allowed" }, 405);
    }
    const unauthorized = () => {
      headers.set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${metadata}", scope="openid"`,
      );
      return respond(
        {
          error: "OAuth token required, invalid, expired or revoked",
          request_id: requestId,
        },
        401,
      );
    };
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return unauthorized();
    try {
      await verify(token);
    } catch {
      return unauthorized();
    }
    const db = createClient(config.supabaseUrl, config.anonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    try {
      const { data, error } = await db.rpc("mcp_check_access");
      if (error) {
        return respond(
          {
            error: "Nutrifit authentication service unavailable",
            request_id: requestId,
          },
          503,
        );
      }
      if (data !== true) return unauthorized();
      // A fresh server/transport/client per HTTP request prevents identity leakage.
      const server = createServer(
        new NutrifitRepository(db),
        requestId,
        undefined,
        config.probe,
      );
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      try {
        const response = await transport.handleRequest(request);
        headers.forEach((value, key) => response.headers.set(key, value));
        return response;
      } finally {
        await server.close();
      }
    } catch {
      return respond(
        {
          error: "Nutrifit service unavailable",
          request_id: requestId,
        },
        503,
      );
    }
  };
}
