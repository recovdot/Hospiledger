import { z } from "zod";

import type { ApiConfig } from "../config";
import type { Logger } from "../logger";

const CHAT_COMPLETIONS_PATH = "/chat/completions";
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 60_000;
const BASE_RETRY_DELAY_MS = 500;
/** Rate limit and provider timeout; every 5xx is retryable too. */
const RETRYABLE_STATUSES: readonly number[] = [429, 498];

const chatEnvelopeSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
});

const failureEnvelopeSchema = z.object({ error: z.object({ message: z.string() }) });

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

type ChatResponseFormat = "json_schema" | "json_object";

type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

type ChatCompletionBody = {
  model: string;
  messages: Array<{ role: "system"; content: string } | { role: "user"; content: ChatContentPart[] }>;
  response_format:
    | { type: "json_schema"; json_schema: { name: string; strict: true; schema: Record<string, unknown> } }
    | { type: "json_object" };
  stream: false;
  n: 1;
  max_completion_tokens: number;
  reasoning_effort: "none";
  reasoning_format: "hidden";
  temperature: 0;
};

export type StructuredChatRequest<S extends z.ZodType> = {
  /** Name reported to the provider in `response_format.json_schema.name`. */
  schemaName: string;
  schema: S;
  system: string;
  prompt: string;
  /** Short-lived HTTPS URLs, appended as `image_url` parts after the text part. Never base64. */
  imageUrls: readonly string[];
  maxCompletionTokens: number;
};

export type StructuredChatClient = {
  complete<S extends z.ZodType>(request: StructuredChatRequest<S>): Promise<z.output<S>>;
};

/** A call that never produced a usable reply: transport failure, HTTP failure, or an invalid reply. */
export class StructuredChatError extends Error {
  /** HTTP status of the failing call, or null when the request never reached the provider. */
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "StructuredChatError";
    this.status = status;
  }
}

/** The provider replied, but its reply content is not the JSON object the schema requires. */
export class StructuredChatValidationError extends StructuredChatError {
  constructor(message: string) {
    super(message);
    this.name = "StructuredChatValidationError";
  }
}

/** Converts a zod schema into the strict JSON schema the provider's constrained decoding needs. */
function toStrictJsonSchema(node: z.ZodType): Record<string, unknown> {
  const jsonSchema: Record<string, unknown> = { ...z.toJSONSchema(node, { target: "draft-2020-12", io: "output" }) };
  delete jsonSchema.$schema;
  return jsonSchema;
}

function readRetryAfterMs(reply: Response): number | null {
  const header = reply.headers.get("retry-after");
  if (header === null) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
}

async function readFailureMessage(reply: Response): Promise<string> {
  try {
    const failure = failureEnvelopeSchema.safeParse(await reply.json());
    if (failure.success) return `Panggilan AI gagal (${reply.status}): ${failure.data.error.message}`;
  } catch {
    // The provider did not send a JSON error envelope; the status alone has to describe the failure.
  }
  return `Panggilan AI gagal (HTTP ${reply.status}).`;
}

async function readReply<S extends z.ZodType>(reply: Response, schema: S): Promise<z.output<S>> {
  let envelope: unknown;
  try {
    envelope = await reply.json();
  } catch {
    throw new StructuredChatValidationError("Balasan AI bukan JSON.");
  }
  const chat = chatEnvelopeSchema.safeParse(envelope);
  if (!chat.success) throw new StructuredChatValidationError("Balasan AI tidak memuat konten pesan.");
  const content = chat.data.choices[0]?.message.content;
  if (content === undefined) throw new StructuredChatValidationError("Balasan AI tidak memuat konten pesan.");
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    throw new StructuredChatValidationError("Konten balasan AI bukan JSON.");
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new StructuredChatValidationError(`Konten balasan AI tidak sesuai skema: ${parsed.error.message}`);
  }
  return parsed.data;
}

function buildRequestBody<S extends z.ZodType>(
  config: ApiConfig,
  request: StructuredChatRequest<S>,
  format: ChatResponseFormat,
): ChatCompletionBody {
  const imageParts: ChatContentPart[] = request.imageUrls.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));
  return {
    model: config.AI_VISION_MODEL,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: [{ type: "text", text: request.prompt }, ...imageParts] },
    ],
    response_format:
      format === "json_schema"
        ? {
            type: "json_schema",
            json_schema: { name: request.schemaName, strict: true, schema: toStrictJsonSchema(request.schema) },
          }
        : { type: "json_object" },
    stream: false,
    n: 1,
    max_completion_tokens: request.maxCompletionTokens,
    reasoning_effort: "none",
    reasoning_format: "hidden",
    temperature: 0,
  };
}

/**
 * Creates the low-level chat client used by the inspection stages.
 *
 * Every call is a single non-streaming completion that asks for structured JSON and validates the
 * decoded object with the caller's zod schema. Retryable failures (429, 498, 5xx, transport errors)
 * are retried at most three times in total, honouring `retry-after`; other HTTP failures are thrown
 * immediately. A reply that fails validation is never retried here, so the caller can decide once
 * whether the stage is worth repeating.
 *
 * @param config API configuration carrying the base URL, key and model
 * @param logger structured logger for retry and degradation events
 * @returns the structured chat client
 */
export function createStructuredChatClient(config: ApiConfig, logger: Logger): StructuredChatClient {
  const endpoint = `${config.AI_API_BASE_URL.replace(/\/+$/, "")}${CHAT_COMPLETIONS_PATH}`;

  const sendWithRetries = async <S extends z.ZodType>(
    request: StructuredChatRequest<S>,
    format: ChatResponseFormat,
  ): Promise<z.output<S>> => {
    const body = buildRequestBody(config, request, format);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let reply: Response;
      try {
        reply = await fetch(endpoint, {
          method: "POST",
          headers: { authorization: `Bearer ${config.AI_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new StructuredChatError(`Panggilan AI gagal: ${reason}`);
        }
        const delayMs = Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
        logger.warn("Panggilan AI gagal di jaringan, mencoba ulang.", { attempt, delayMs, model: body.model });
        await delay(delayMs);
        continue;
      }

      if (reply.ok) return await readReply(reply, request.schema);

      const failure = new StructuredChatError(await readFailureMessage(reply), reply.status);
      const isRetryable = RETRYABLE_STATUSES.includes(reply.status) || reply.status >= 500;
      if (!isRetryable || attempt === MAX_ATTEMPTS) throw failure;

      const delayMs = Math.min(readRetryAfterMs(reply) ?? BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
      logger.warn("Panggilan AI gagal, mencoba ulang.", {
        status: reply.status,
        attempt,
        delayMs,
        schema: request.schemaName,
      });
      await delay(delayMs);
    }

    throw new StructuredChatError("Panggilan AI gagal setelah semua percobaan.");
  };

  return {
    async complete(request) {
      try {
        return await sendWithRetries(request, "json_schema");
      } catch (error) {
        if (!(error instanceof StructuredChatError) || error.status !== 400) throw error;
        // A 400 can mean this model rejects strict json_schema, so the same call gets one json_object chance.
        logger.warn("Provider menolak json_schema, mengulang dengan json_object.", { schema: request.schemaName });
        return await sendWithRetries(request, "json_object");
      }
    },
  };
}
