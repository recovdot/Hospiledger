import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";

import type { ApiConfig } from "../config";
import type { Logger } from "../logger";
import { StructuredChatError, StructuredChatValidationError, createStructuredChatClient } from "./client";

const realFetch = globalThis.fetch;

const testConfig: ApiConfig = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  AI_API_KEY: "test-key",
  AI_API_BASE_URL: "https://api.groq.com/openai/v1",
  AI_VISION_MODEL: "qwen/qwen3.8-27b",
  SOLANA_CLUSTER: "devnet",
  SOLANA_RPC_URL: "https://api.devnet.solana.com",
  SOLANA_SIGNER_SECRET: "test-secret",
};

type JsonObject = Record<string, unknown>;
type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

type ChatBody = {
  model: string;
  messages: Array<{ role: string; content: string | ChatContentPart[] }>;
  response_format: { type: string; json_schema?: { name: string; strict: boolean; schema: JsonObject } };
  stream: boolean;
  n: number;
  max_completion_tokens: number;
  reasoning_effort: string;
  reasoning_format: string;
  temperature: number;
};

type MockReply = {
  status?: number;
  content?: unknown;
  rawContent?: string;
  errorMessage?: string;
  retryAfter?: string;
};

type CapturedCall = { url: string; body: ChatBody; headers: Record<string, string> };

const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

const sampleSchema = z.strictObject({
  label: z.string().nullable(),
  score: z.int().min(0).max(100),
  damage: z.array(z.strictObject({ kind: z.enum(["scratch", "rust"]), note: z.string().nullable() })),
});

const request = {
  schemaName: "sample_schema",
  schema: sampleSchema,
  system: "system text",
  prompt: "user text",
  imageUrls: ["https://storage.test/front.jpg"],
  maxCompletionTokens: 1234,
};

function captureFetch(replies: MockReply[]): CapturedCall[] {
  const calls: CapturedCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as ChatBody;
    calls.push({
      url: String(input),
      body,
      headers: init?.headers === undefined ? {} : Object.fromEntries(new Headers(init.headers)),
    });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)] ?? {};
    const envelope =
      reply.errorMessage === undefined
        ? { choices: [{ message: { content: reply.rawContent ?? JSON.stringify(reply.content) } }] }
        : { error: { message: reply.errorMessage } };
    return new Response(JSON.stringify(envelope), {
      status: reply.status ?? 200,
      headers: reply.retryAfter === undefined ? {} : { "retry-after": reply.retryAfter },
    });
  }) as typeof fetch;
  return calls;
}

function firstCall(calls: CapturedCall[]): CapturedCall {
  const call = calls[0];
  if (call === undefined) throw new Error("the client did not call the provider");
  return call;
}

function userContentOf(call: CapturedCall): ChatContentPart[] {
  const userMessage = call.body.messages.find((message) => message.role === "user");
  if (userMessage === undefined || typeof userMessage.content === "string") {
    throw new Error("the user message must carry content parts");
  }
  return userMessage.content;
}

function walkStrictObjects(node: unknown): number {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return 0;
  const record = node as JsonObject;
  let visited = 0;
  if (record.type === "object" && typeof record.properties === "object" && record.properties !== null) {
    const properties = record.properties as JsonObject;
    expect(record.additionalProperties).toBe(false);
    expect([...(record.required as string[])].sort()).toEqual(Object.keys(properties).sort());
    visited += 1;
    for (const property of Object.values(properties)) visited += walkStrictObjects(property);
  }
  const items = record.items;
  if (Array.isArray(items)) {
    for (const item of items) visited += walkStrictObjects(item);
  } else {
    visited += walkStrictObjects(items);
  }
  for (const keyword of ["anyOf", "oneOf", "allOf"]) {
    const branches = record[keyword];
    if (Array.isArray(branches)) for (const branch of branches) visited += walkStrictObjects(branch);
  }
  return visited;
}

async function thrownBy(work: Promise<unknown>): Promise<unknown> {
  return await work.catch((error: unknown) => error);
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("createStructuredChatClient", () => {
  test("posts one strict json_schema call with the documented extras and the image parts", async () => {
    const calls = captureFetch([{ content: { label: "Acme", score: 88, damage: [] } }]);
    const parsed = await createStructuredChatClient(testConfig, silentLogger).complete(request);

    expect(calls).toHaveLength(1);
    const call = firstCall(calls);
    expect(call.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(call.headers.authorization).toBe("Bearer test-key");
    expect(call.headers["content-type"]).toBe("application/json");
    expect(call.body.model).toBe(testConfig.AI_VISION_MODEL);
    expect(call.body.stream).toBe(false);
    expect(call.body.n).toBe(1);
    expect(call.body.max_completion_tokens).toBe(1234);
    expect(call.body.temperature).toBe(0);
    expect(call.body.reasoning_effort).toBe("none");
    expect(call.body.reasoning_format).toBe("hidden");
    expect(call.body.response_format.type).toBe("json_schema");
    expect(call.body.response_format.json_schema?.strict).toBe(true);
    expect(call.body.response_format.json_schema?.schema.$schema).toBeUndefined();
    expect(parsed).toEqual({ label: "Acme", score: 88, damage: [] });

    const content = userContentOf(call);
    expect(content[0]).toEqual({ type: "text", text: "user text" });
    expect(content.slice(1)).toEqual([
      { type: "image_url", image_url: { url: "https://storage.test/front.jpg" } },
    ]);
  });

  test("generates a schema whose objects are all strict and list every property as required", async () => {
    const calls = captureFetch([{ content: { label: null, score: 1, damage: [{ kind: "rust", note: null }] } }]);
    await createStructuredChatClient(testConfig, silentLogger).complete(request);

    const schema = firstCall(calls).body.response_format.json_schema?.schema;
    expect(walkStrictObjects(schema)).toBe(2);
  });

  test("retries a 429 and honours the retry-after header", async () => {
    const calls = captureFetch([
      { status: 429, errorMessage: "rate limit reached", retryAfter: "0" },
      { content: { label: "Acme", score: 88, damage: [] } },
    ]);
    const parsed = await createStructuredChatClient(testConfig, silentLogger).complete(request);

    expect(calls).toHaveLength(2);
    expect(parsed.label).toBe("Acme");
  });

  test("gives up after three attempts on a retryable status", async () => {
    const calls = captureFetch([{ status: 500, errorMessage: "boom", retryAfter: "0" }]);
    const failure = await thrownBy(createStructuredChatClient(testConfig, silentLogger).complete(request));

    expect(failure).toBeInstanceOf(StructuredChatError);
    expect(calls).toHaveLength(3);
  });

  test("falls back to json_object once when json_schema is rejected with a 400", async () => {
    const warnings: string[] = [];
    const logger: Logger = {
      info: () => {},
      warn: (message) => {
        warnings.push(message);
      },
      error: () => {},
    };
    const calls = captureFetch([
      { status: 400, errorMessage: "json_schema is not supported for this model" },
      { content: { label: "Acme", score: 42, damage: [] } },
    ]);
    const parsed = await createStructuredChatClient(testConfig, logger).complete(request);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.body.response_format.type).toBe("json_schema");
    expect(calls[1]?.body.response_format.type).toBe("json_object");
    expect(calls[1]?.body.response_format.json_schema).toBeUndefined();
    expect(calls[1]?.body.max_completion_tokens).toBe(1234);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("json_object");
    expect(parsed.score).toBe(42);
  });

  test("does not retry a 400 a second time", async () => {
    const calls = captureFetch([{ status: 400, errorMessage: "bad request" }]);
    const failure = await thrownBy(createStructuredChatClient(testConfig, silentLogger).complete(request));

    expect(failure).toBeInstanceOf(StructuredChatError);
    if (failure instanceof StructuredChatError) expect(failure.status).toBe(400);
    expect(calls).toHaveLength(2);
  });

  test("does not retry a 401", async () => {
    const calls = captureFetch([
      { status: 401, errorMessage: "invalid api key" },
      { content: { label: "Acme", score: 88, damage: [] } },
    ]);
    const failure = await thrownBy(createStructuredChatClient(testConfig, silentLogger).complete(request));

    expect(failure).toBeInstanceOf(StructuredChatError);
    if (failure instanceof StructuredChatError) expect(failure.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  test("surfaces a reply that is not JSON as a validation error without retrying it", async () => {
    const calls = captureFetch([{ rawContent: "here is your JSON: {}" }]);
    const failure = await thrownBy(createStructuredChatClient(testConfig, silentLogger).complete(request));

    expect(failure).toBeInstanceOf(StructuredChatValidationError);
    expect(calls).toHaveLength(1);
  });

  test("surfaces a reply that violates the schema as a validation error", async () => {
    const calls = captureFetch([{ content: { label: "Acme", score: 200, damage: [] } }]);
    const failure = await thrownBy(createStructuredChatClient(testConfig, silentLogger).complete(request));

    expect(failure).toBeInstanceOf(StructuredChatValidationError);
    expect(failure instanceof Error ? failure.message : "").toContain("tidak sesuai skema");
    expect(calls).toHaveLength(1);
  });
});
