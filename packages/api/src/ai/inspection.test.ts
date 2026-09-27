import { afterEach, describe, expect, test } from "bun:test";

import type { ApiConfig } from "../config";
import type { Logger } from "../logger";
import { createInspectionAi } from "./inspection";
import { AiInspectionError } from "./types";
import type { InspectionRequest } from "./types";

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

const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

type JsonObject = Record<string, unknown>;
type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

type ChatBody = {
  messages: Array<{ role: string; content: string | ChatContentPart[] }>;
  response_format: { type: string; json_schema?: { strict: boolean; schema: JsonObject } };
  stream: boolean;
  n: number;
  max_completion_tokens: number;
};

type MockReply = { status?: number; content?: unknown; errorMessage?: string };
type CapturedCall = { url: string; body: ChatBody };

const request: InspectionRequest = {
  asset: {
    category: "refrigerator",
    brand: "Acme",
    model: "X1",
    serialNumber: null,
    year: 2019,
    capacity: "400 L",
    location: "Jakarta",
    previousUsage: "Restoran",
  },
  photos: [
    { type: "front", url: "https://storage.test/front.jpg" },
    { type: "side", url: "https://storage.test/side.jpg" },
    { type: "back", url: "https://storage.test/back.jpg" },
    { type: "nameplate", url: "https://storage.test/nameplate.jpg" },
  ],
};

const unreadableOcr = { serialNumber: null, voltage: null, capacity: null, manufacturingDate: null };

function recognitionReply(overrides: JsonObject = {}): JsonObject {
  return {
    detectedBrand: "Acme",
    detectedModel: "X1",
    confidence: 0.82,
    ocr: unreadableOcr,
    damage: [],
    photoNotes: "Foto jelas dan terang.",
    ...overrides,
  };
}

function assessmentReply(overrides: JsonObject = {}): JsonObject {
  return {
    damageSeverity: "medium",
    physical: 70,
    visual: 65,
    completeness: 80,
    overall: 72,
    grade: "B",
    ...overrides,
  };
}

function captureFetch(replies: MockReply[]): CapturedCall[] {
  const calls: CapturedCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as ChatBody;
    calls.push({ url: String(input), body });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)] ?? {};
    const envelope =
      reply.errorMessage === undefined
        ? { choices: [{ message: { content: JSON.stringify(reply.content) } }] }
        : { error: { message: reply.errorMessage } };
    return new Response(JSON.stringify(envelope), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

function callAt(calls: CapturedCall[], index: number): CapturedCall {
  const call = calls[index];
  if (call === undefined) throw new Error(`the client made no call at index ${index}`);
  return call;
}

function contentOf(call: CapturedCall): ChatContentPart[] {
  const userMessage = call.body.messages.find((message) => message.role === "user");
  if (userMessage === undefined || typeof userMessage.content === "string") {
    throw new Error("the user message must carry content parts");
  }
  return userMessage.content;
}

function imageUrlsOf(call: CapturedCall): string[] {
  return contentOf(call).flatMap((part) => (part.type === "image_url" ? [part.image_url.url] : []));
}

function userTextOf(call: CapturedCall): string {
  const part = contentOf(call)[0];
  if (part === undefined || part.type !== "text") throw new Error("the first content part must be text");
  return part.text;
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

describe("createInspectionAi", () => {
  test("sends one vision call per batch of three photos and one photo-free assessment call", async () => {
    const calls = captureFetch([
      { content: recognitionReply({ damage: [{ kind: "scratch", severity: "low", area: "pintu", note: "goresan" }] }) },
      { content: recognitionReply() },
      { content: assessmentReply() },
    ]);
    await createInspectionAi(testConfig, silentLogger).inspect(request);

    expect(calls).toHaveLength(3);
    expect(calls.map((call) => imageUrlsOf(call).length)).toEqual([3, 1, 0]);
    for (const call of calls.slice(0, 2)) {
      expect(imageUrlsOf(call).length).toBeLessThanOrEqual(3);
      expect(call.body.max_completion_tokens).toBeGreaterThan(0);
      expect(call.body.stream).toBe(false);
      expect(call.body.n).toBe(1);
      expect(call.body.response_format.json_schema?.strict).toBe(true);
      expect(call.body.response_format.json_schema?.schema.$schema).toBeUndefined();
    }
    expect(userTextOf(callAt(calls, 1))).toContain("nameplate");
    expect(walkStrictObjects(callAt(calls, 0).body.response_format.json_schema?.schema)).toBe(3);
    expect(walkStrictObjects(callAt(calls, 2).body.response_format.json_schema?.schema)).toBe(1);
  });

  test("reports progress after each recognition batch and before the assessment", async () => {
    captureFetch([
      { content: recognitionReply() },
      { content: recognitionReply() },
      { content: assessmentReply() },
    ]);
    const progress: unknown[] = [];
    await createInspectionAi(testConfig, silentLogger).inspect(request, {
      onProgress: (entry) => { progress.push(entry); },
    });

    expect(progress).toEqual([
      { stage: "recognition", done: 1, total: 3 },
      { stage: "recognition", done: 2, total: 3 },
      { stage: "assessment", done: 2, total: 3 },
    ]);
  });

  test("carries the merged damage kinds and the photo notes into the aggregation call", async () => {
    const calls = captureFetch([
      {
        content: recognitionReply({
          damage: [{ kind: "scratch", severity: "low", area: "pintu", note: "goresan halus" }],
          photoNotes: "Batch pertama jelas.",
        }),
      },
      {
        content: recognitionReply({
          damage: [{ kind: "rust", severity: "medium", area: "kaki", note: "karat ringan" }],
          photoNotes: "Nameplate terbaca.",
        }),
      },
      { content: assessmentReply() },
    ]);
    await createInspectionAi(testConfig, silentLogger).inspect(request);

    const assessment = callAt(calls, 2);
    expect(imageUrlsOf(assessment)).toEqual([]);
    const text = userTextOf(assessment);
    expect(text).toContain("scratch");
    expect(text).toContain("rust");
    expect(text).toContain("Batch pertama jelas.");
    expect(text).toContain("Nameplate terbaca.");
  });

  test("maps merged stages into an outcome with raw AI evidence and no unsupported valuation", async () => {
    const calls = captureFetch([
      {
        content: recognitionReply({
          damage: [{ kind: "scratch", severity: "low", area: "pintu", note: "goresan halus" }],
        }),
      },
      {
        content: recognitionReply({
          ocr: { serialNumber: "SN-123", voltage: "220V", capacity: "400 L", manufacturingDate: "2019-05" },
          damage: [{ kind: "rust", severity: "medium", area: "kaki", note: "karat ringan" }],
        }),
      },
      { content: assessmentReply() },
    ]);
    const outcome = await createInspectionAi(testConfig, silentLogger).inspect(request);

    expect(calls).toHaveLength(3);
    expect(outcome.detectedBrand).toBe("Acme");
    expect(outcome.detectedModel).toBe("X1");
    expect(outcome.confidence).toBe(0.82);
    expect(outcome.ocr).toEqual({
      serialNumber: "SN-123",
      voltage: "220V",
      capacity: "400 L",
      manufacturingDate: "2019-05",
    });
    expect(outcome.damage).toEqual([
      { kind: "scratch", severity: "low", area: "pintu", note: "goresan halus" },
      { kind: "rust", severity: "medium", area: "kaki", note: "karat ringan" },
    ]);
    expect(outcome.damageSeverity).toBe("medium");
    expect(outcome.scoreComponents).toEqual({ physical: 70, visual: 65, completeness: 80, overall: 72, grade: "B" });
    expect(outcome.rawOutput.recognition).toHaveLength(2);
    expect(outcome.rawOutput.assessment).toEqual({
      damageSeverity: "medium", physical: 70, visual: 65, completeness: 80, overall: 72, grade: "B",
    });
    expect([outcome.valueEstimate, outcome.valueMin, outcome.valueMax]).toEqual([null, null, null]);
  });

  test("prefers a complete identity over a more confident partial reading", async () => {
    captureFetch([
      { content: recognitionReply({ detectedBrand: "Alpha", detectedModel: null, confidence: 0.99 }) },
      { content: recognitionReply({ detectedBrand: "Beta", detectedModel: "B2", confidence: 0.65 }) },
      { content: assessmentReply() },
    ]);
    const outcome = await createInspectionAi(testConfig, silentLogger).inspect(request);

    expect([outcome.detectedBrand, outcome.detectedModel, outcome.confidence]).toEqual(["Beta", "B2", 0.65]);
  });

  test("picks the highest-confidence complete pair without mixing batches", async () => {
    captureFetch([
      { content: recognitionReply({ detectedBrand: "Alpha", detectedModel: "A1", confidence: 0.6 }) },
      { content: recognitionReply({ detectedBrand: "Beta", detectedModel: "B2", confidence: 0.9 }) },
      { content: assessmentReply() },
    ]);
    const outcome = await createInspectionAi(testConfig, silentLogger).inspect(request);

    expect([outcome.detectedBrand, outcome.detectedModel, outcome.confidence]).toEqual(["Beta", "B2", 0.9]);
  });

  test("does not combine partial identities when no complete pair exists", async () => {
    captureFetch([
      { content: recognitionReply({ detectedBrand: "Alpha", detectedModel: null, confidence: 0.6 }) },
      { content: recognitionReply({ detectedBrand: null, detectedModel: "B2", confidence: 0.9 }) },
      { content: assessmentReply() },
    ]);
    const outcome = await createInspectionAi(testConfig, silentLogger).inspect(request);

    expect([outcome.detectedBrand, outcome.detectedModel, outcome.confidence]).toEqual([null, "B2", 0.9]);
  });

  test("rejects assessment replies with unsupported valuation fields", async () => {
    const calls = captureFetch([
      { content: recognitionReply() },
      { content: recognitionReply() },
      { content: { ...assessmentReply(), valueEstimate: 6_000_000 } },
      { content: { ...assessmentReply(), valueEstimate: 6_000_000 } },
    ]);
    const failure = await thrownBy(createInspectionAi(testConfig, silentLogger).inspect(request));

    expect(failure).toBeInstanceOf(AiInspectionError);
    expect((failure as AiInspectionError).retryable).toBe(false);
    expect((failure as AiInspectionError).message).toBe("Hasil inspeksi AI tidak lolos validasi pada tahap penilaian kondisi.");
    expect(calls).toHaveLength(4);
  });

  test("keeps unreadable nameplate fields null end to end", async () => {
    captureFetch([
      { content: recognitionReply({ detectedBrand: null, detectedModel: null, confidence: null }) },
      { content: recognitionReply({ detectedBrand: null, detectedModel: null, confidence: null }) },
      { content: assessmentReply({ damageSeverity: null }) },
    ]);
    const outcome = await createInspectionAi(testConfig, silentLogger).inspect(request);

    expect(outcome.detectedBrand).toBeNull();
    expect(outcome.detectedModel).toBeNull();
    expect(outcome.confidence).toBeNull();
    expect(outcome.ocr).toEqual(unreadableOcr);
    expect(outcome.damageSeverity).toBeNull();
    expect(outcome.valueEstimate).toBeNull();
    expect(outcome.valueMin).toBeNull();
    expect(outcome.valueMax).toBeNull();
  });

  test("asks for a batch again when its reply violates the schema", async () => {
    const calls = captureFetch([
      { content: { detectedBrand: "Acme" } },
      { content: recognitionReply({ detectedBrand: "RetryBrand" }) },
      { content: recognitionReply() },
      { content: assessmentReply() },
    ]);
    const outcome = await createInspectionAi(testConfig, silentLogger).inspect(request);

    expect(calls).toHaveLength(4);
    expect(imageUrlsOf(callAt(calls, 0))).toHaveLength(3);
    expect(imageUrlsOf(callAt(calls, 1))).toHaveLength(3);
    expect(outcome.detectedBrand).toBe("RetryBrand");
  });

  test("fails with the stage name when a batch stays invalid", async () => {
    const calls = captureFetch([{ content: { detectedBrand: "Acme" } }, { content: { detectedBrand: "Acme" } }]);
    const failure = await thrownBy(createInspectionAi(testConfig, silentLogger).inspect(request));

    expect((failure as AiInspectionError).retryable).toBe(false);
    expect(failure).toBeInstanceOf(AiInspectionError);
    expect(failure instanceof Error ? failure.message : "").toBe(
      "Hasil inspeksi AI tidak lolos validasi pada tahap pengenalan peralatan.",
    );
    expect(calls).toHaveLength(2);
  });

  test("fails with the assessment stage name when that stage stays invalid", async () => {
    const calls = captureFetch([
      { content: recognitionReply() },
      { content: recognitionReply() },
      { content: { damageSeverity: "medium" } },
      { content: { damageSeverity: "medium" } },
    ]);
    const failure = await thrownBy(createInspectionAi(testConfig, silentLogger).inspect(request));
    expect((failure as AiInspectionError).retryable).toBe(false);

    expect(failure).toBeInstanceOf(AiInspectionError);
    expect(failure instanceof Error ? failure.message : "").toBe(
      "Hasil inspeksi AI tidak lolos validasi pada tahap penilaian kondisi.",
    );
    expect(calls).toHaveLength(4);
  });

  test("marks provider failures retryable without exposing provider details to the seller", async () => {
    const calls = captureFetch([{ status: 403, errorMessage: "private provider credential" }]);
    const failure = await thrownBy(createInspectionAi(testConfig, silentLogger).inspect(request));

    expect(failure).toBeInstanceOf(AiInspectionError);
    expect((failure as AiInspectionError).retryable).toBe(true);
    expect((failure as AiInspectionError).message).toBe("Layanan inspeksi AI gagal pada tahap pengenalan peralatan.");
    expect(calls).toHaveLength(1);
  });

  test("requires at least one evidence photo before calling the provider", async () => {
    const calls = captureFetch([{ content: assessmentReply() }]);
    const failure = await thrownBy(createInspectionAi(testConfig, silentLogger).inspect({ ...request, photos: [] }));

    expect(failure).toBeInstanceOf(AiInspectionError);
    expect((failure as AiInspectionError).retryable).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
