import { assert, assertEquals } from "@std/assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.ts";
import type { Repository, SearchInput } from "./repository.ts";
import type { Proposal } from "./nutrition.ts";

interface ListedTool {
  name: string;
  annotations?: { readOnlyHint?: boolean };
}

class FakeRepository implements Repository {
  readonly calls: string[] = [];
  async search(input: SearchInput): Promise<unknown> {
    this.calls.push(`search:${input.visibility}`);
    return { items: [] };
  }
  async food(id: string): Promise<unknown> {
    this.calls.push(`food:${id}`);
    return { id };
  }
  async day(date?: string): Promise<unknown> {
    this.calls.push(`day:${date ?? "today"}`);
    return { date: date ?? "today" };
  }
  async create(_proposal: Proposal, key: string): Promise<unknown> {
    this.calls.push(`create:${key}`);
    return { created: true };
  }
}

Deno.test(
  "MCP probe mode exposes no business tools; full mode exposes the five planned tools",
  async () => {
    const repository = new FakeRepository();
    const probeServer = createServer(
      repository,
      "request-1",
      () => undefined,
      true,
    );
    const [probeClientTransport, probeServerTransport] =
      InMemoryTransport.createLinkedPair();
    const probeClient = new Client({ name: "test-client", version: "1.0.0" });
    await probeServer.connect(probeServerTransport);
    await probeClient.connect(probeClientTransport);
    const probeTools = (await probeClient.listTools()).tools as ListedTool[];
    assertEquals(
      probeTools.map((tool: ListedTool) => tool.name),
      ["connection_status"],
    );
    await probeClient.close();
    await probeServer.close();

    const server = createServer(repository, "request-2", () => undefined);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = (await client.listTools()).tools as ListedTool[];
    assertEquals(
      tools.map((tool: ListedTool) => tool.name),
      [
        "search_foods",
        "get_food",
        "get_day_summary",
        "preview_food",
        "create_food",
      ],
    );
    assert(
      tools.find((tool: ListedTool) => tool.name === "preview_food")
        ?.annotations?.readOnlyHint,
    );
    assertEquals(
      tools.find((tool: ListedTool) => tool.name === "create_food")?.annotations
        ?.readOnlyHint,
      false,
    );
    await client.close();
    await server.close();
  },
);

Deno.test(
  "preview does not create a food and creation requires a valid proposal",
  async () => {
    const repository = new FakeRepository();
    const server = createServer(repository, "request-3", () => undefined);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const proposal = {
      name: "Soup",
      carbs_g: 5,
      fats_g: 2,
      proteins_g: 3,
      estimated: true,
      assumptions: ["Estimated bowl proportions"],
    };
    const preview = await client.callTool({
      name: "preview_food",
      arguments: { proposal },
    });
    assertEquals(preview.isError, undefined);
    assertEquals(repository.calls, []);
    const created = await client.callTool({
      name: "create_food",
      arguments: { proposal, idempotency_key: "soup-key-123" },
    });
    assertEquals(created.isError, undefined);
    assertEquals(repository.calls, ["create:soup-key-123"]);
    const invalid = await client.callTool({
      name: "preview_food",
      arguments: {
        proposal: { ...proposal, assumptions: [], estimated: true },
      },
    });
    assertEquals(invalid.isError, true);
    await client.close();
    await server.close();
  },
);

Deno.test(
  "logs carry request metadata without food or nutrition content",
  async () => {
    const entries: Array<{
      request_id: string;
      tool: string;
      duration_ms: number;
      status: string;
    }> = [];
    const server = createServer(new FakeRepository(), "request-4", (entry) =>
      entries.push(entry),
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await client.callTool({
      name: "get_day_summary",
      arguments: { date: "2026-11-03" },
    });
    assertEquals(entries.length, 1);
    assertEquals(entries[0].request_id, "request-4");
    assertEquals(entries[0].tool, "get_day_summary");
    assertEquals(entries[0].status, "ok");
    assert(!JSON.stringify(entries).includes("nutrition"));
    await client.close();
    await server.close();
  },
);
