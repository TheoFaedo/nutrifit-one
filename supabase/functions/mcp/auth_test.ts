import { assertEquals, assertRejects } from "@std/assert";
import { generateKeyPair, SignJWT } from "jose";
import { tokenVerifier } from "./auth.ts";

const config = {
  supabaseUrl: "https://project.supabase.co",
  anonKey: "test-publishable-key",
  resource: "https://project.supabase.co/functions/v1/mcp",
  clientId: "nutrifit-chatgpt-client",
  origins: ["https://chatgpt.com"],
  probe: true,
};

Deno.test(
  "verifies Supabase issuer, MCP and PostgREST audiences, client and identity claims",
  async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const verify = tokenVerifier(config, async () => publicKey);
    const token = await new SignJWT({
      role: "authenticated",
      client_id: config.clientId,
      session_id: "session-1",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(`${config.supabaseUrl}/auth/v1`)
      .setAudience(["authenticated", config.resource])
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const payload = await verify(token);
    assertEquals(payload.sub, "user-1");
    assertEquals(payload.client_id, config.clientId);

    const wrongResource = await new SignJWT({
      role: "authenticated",
      client_id: config.clientId,
      session_id: "session-1",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(`${config.supabaseUrl}/auth/v1`)
      .setAudience(["authenticated", "https://wrong.example/mcp"])
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    await assertRejects(() => verify(wrongResource));

    const wrongClient = await new SignJWT({
      role: "authenticated",
      client_id: "another-client",
      session_id: "session-1",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(`${config.supabaseUrl}/auth/v1`)
      .setAudience(["authenticated", config.resource])
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    await assertRejects(() => verify(wrongClient));
  },
);
