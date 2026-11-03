import type { SupabaseClient } from "@supabase/supabase-js";
import type { Proposal } from "./nutrition.ts";

export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface SearchInput {
  query: string;
  visibility: "personal" | "public" | "all";
  sort: "recent" | "newest" | "asc" | "desc";
  offset: number;
  limit: number;
}
export interface Repository {
  search(input: SearchInput): Promise<unknown>;
  food(id: string): Promise<unknown>;
  day(date?: string): Promise<unknown>;
  create(proposal: Proposal, key: string): Promise<unknown>;
}

export class NutrifitRepository implements Repository {
  constructor(private readonly db: SupabaseClient) {}

  private async rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = await this.db.rpc(name, args);
    if (!error) return data;
    if (error.code === "42501") {
      throw new ToolError(
        "FORBIDDEN",
        "Access denied or revoked. Reconnect Nutrifit.",
      );
    }
    if (error.code === "22023") {
      throw new ToolError("INVALID_INPUT", error.message);
    }
    throw new ToolError(
      "UNAVAILABLE",
      "Nutrifit is temporarily unavailable. Retry later.",
    );
  }

  async search(input: SearchInput): Promise<unknown> {
    return await this.rpc("mcp_search_foods", {
      p_term: input.query,
      p_visibility: input.visibility,
      p_sort: input.sort,
      p_offset: input.offset,
      p_limit: input.limit,
    });
  }
  async food(id: string): Promise<unknown> {
    const food = await this.rpc("mcp_get_food", { p_food_id: id });
    if (!food) {
      throw new ToolError("NOT_FOUND", "Food not found or not accessible.");
    }
    return food;
  }
  async day(date?: string): Promise<unknown> {
    return await this.rpc("mcp_day_summary", { p_date: date ?? null });
  }
  async create(proposal: Proposal, key: string): Promise<unknown> {
    return await this.rpc("mcp_create_food", {
      p_proposal: proposal,
      p_idempotency_key: key,
    });
  }
}
