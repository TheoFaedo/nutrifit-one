import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface Config {
  supabaseUrl: string;
  anonKey: string;
  resource: string;
  clientId: string;
  origins: string[];
  probe: boolean;
}
export function loadConfig(): Config {
  const required = (key: string) => {
    const value = Deno.env.get(key);
    if (!value) throw new Error(`Missing ${key}`);
    return value;
  };
  const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
  const resource = required("MCP_RESOURCE_URL").replace(/\/$/, "");
  if (new URL(resource).protocol !== "https:") {
    throw new Error("MCP_RESOURCE_URL must use HTTPS");
  }
  return {
    supabaseUrl,
    resource,
    anonKey: required("SUPABASE_ANON_KEY"),
    clientId: required("MCP_CLIENT_ID"),
    origins: (Deno.env.get("MCP_ALLOWED_ORIGINS") ?? "https://chatgpt.com")
      .split(",")
      .map((v) => v.trim()),
    probe: Deno.env.get("MCP_PROBE_ONLY") !== "false",
  };
}
export function tokenVerifier(
  config: Config,
  keys: JWTVerifyGetKey = createRemoteJWKSet(
    new URL(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`),
  ),
) {
  return async (token: string) => {
    const { payload } = await jwtVerify(token, keys, {
      issuer: `${config.supabaseUrl}/auth/v1`,
      audience: "authenticated",
      algorithms: ["ES256", "RS256"],
      requiredClaims: ["exp", "sub", "iat", "session_id", "client_id"],
    });
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (
      payload.client_id !== config.clientId ||
      payload.role !== "authenticated" ||
      !audiences.includes(config.resource)
    ) {
      throw new Error("Wrong OAuth client or resource");
    }
    return payload;
  };
}
