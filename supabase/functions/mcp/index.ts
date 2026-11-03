import { loadConfig } from "./auth.ts";
import { createHandler } from "./handler.ts";

Deno.serve(createHandler(loadConfig()));
