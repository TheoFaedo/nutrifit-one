import { assertEquals, assertStringIncludes } from "@std/assert";
import { createHandler } from "./handler.ts";

const config = {
  supabaseUrl: "https://project.supabase.co",
  anonKey: "test-publishable-key",
  resource: "https://project.supabase.co/functions/v1/mcp",
  clientId: "nutrifit-chatgpt-client",
  origins: ["https://chatgpt.com"],
  probe: true,
};

Deno.test(
  "publishes protected resource metadata and advertises the OAuth authorization server",
  async () => {
    const handler = createHandler(config);
    const response = await handler(
      new Request(`${config.resource}/.well-known/oauth-protected-resource`),
    );
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.resource, config.resource);
    assertEquals(body.authorization_servers, [`${config.supabaseUrl}/auth/v1`]);
  },
);

Deno.test(
  "challenges missing credentials and rejects unapproved origins",
  async () => {
    const handler = createHandler(config);
    const noToken = await handler(
      new Request(config.resource, {
        method: "POST",
        headers: { Origin: "https://chatgpt.com" },
        body: "{}",
      }),
    );
    assertEquals(noToken.status, 401);
    assertStringIncludes(
      noToken.headers.get("WWW-Authenticate") ?? "",
      "oauth-protected-resource",
    );
    assertEquals(
      noToken.headers.get("Access-Control-Allow-Origin"),
      "https://chatgpt.com",
    );

    const badOrigin = await handler(
      new Request(config.resource, {
        method: "OPTIONS",
        headers: { Origin: "https://attacker.example" },
      }),
    );
    assertEquals(badOrigin.status, 403);
  },
);
