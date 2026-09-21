import { createHash } from "node:crypto";

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalJsonError";
  }
}

function canonicalValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError(`Angka tidak terhingga tidak bisa dikanonikalisasi: ${value}.`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new CanonicalJsonError(`Nilai bertipe ${typeof value} tidak bisa dikanonikalisasi.`);
  }
  if (value instanceof Date) {
    throw new CanonicalJsonError("Nilai Date tidak bisa dikanonikalisasi. Gunakan string ISO atau null.");
  }
  if (value instanceof Map || value instanceof Set) {
    throw new CanonicalJsonError(`Nilai ${value.constructor.name} tidak bisa dikanonikalisasi.`);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalValue).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalValue((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Serializes a value as canonical JSON: object keys sorted, no whitespace.
 *
 * @param value JSON-compatible value to serialize
 * @returns the canonical JSON string
 * @throws {CanonicalJsonError} on non-JSON values (`undefined`, functions, symbols, `bigint`, non-finite numbers, `Date`, `Map`, `Set`)
 */
export function canonicalJson(value: unknown): string {
  return canonicalValue(value);
}

/**
 * Computes the lowercase hexadecimal SHA-256 digest of a UTF-8 string.
 *
 * @param input string to hash
 * @returns 64-character hex digest
 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Computes the lowercase hexadecimal SHA-256 digest of raw bytes. Used for uploaded file hashes.
 *
 * @param bytes raw bytes to hash
 * @returns 64-character hex digest
 */
export function sha256HexOfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
