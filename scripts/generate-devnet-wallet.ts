/**
 * Generates a fresh Solana devnet keypair for signing passport memo transactions.
 *
 * Usage (from the repo root):
 *   bun scripts/generate-devnet-wallet.ts
 *   bun scripts/generate-devnet-wallet.ts --check <secret>   # verify a saved secret
 *
 * Self-contained: node:crypto ed25519 + pure base58. No workspace deps.
 * Output: address + base58 secret (64 bytes: seed || public key).
 * Fund the address once on devnet via https://faucet.solana.com
 * Store the secret in SOLANA_SIGNER_SECRET (apps/server/.env locally; Render
 * dashboard for prod). Never commit it or print it to the same logs
 * as the address in shared places.
 */
import { createPrivateKey, createPublicKey, randomBytes } from "node:crypto";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Encodes bytes as base58 with leading-zero handling identical to Bitcoin/Solana. */
function toBase58(input: Uint8Array): string {
  let leadingZeros = 0;
  while (leadingZeros < input.length && input[leadingZeros] === 0) leadingZeros++;
  const size = Math.floor(((input.length - leadingZeros) * 138) / 100) + 1;
  const buffer = new Uint8Array(size);
  let length = 0;
  for (let i = leadingZeros; i < input.length; i++) {
    let carry = input[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * buffer[k];
      buffer[k] = carry % 58;
      carry = (carry / 58) | 0;
    }
    length = j;
  }
  let index = size - length;
  const digits: string[] = [];
  while (index < size) digits.push(ALPHABET[buffer[index++]]);
  return "1".repeat(leadingZeros) + digits.join("");
}

/**
 * Builds a Solana keypair from a fresh 32-byte seed.
 * @returns {address} base58 public key used as the on-devnet address ({@link seed}) holder.
 * @returns {secretKeyBase58} 64-byte (seed || publicKey) secret, base58 encoded.
 */
export function generateDevnetKeypair(): {
  address: string;
  secretKeyBase58: string;
} {
  const seed = randomBytes(32);
  const pkcs8SeedDer = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]);
  const privateKey = createPrivateKey({ key: pkcs8SeedDer, format: "der", type: "pkcs8" });
  const publicKeyBytes = new Uint8Array(
    (createPublicKey(privateKey).export({ format: "der", type: "spki" }) as Buffer).slice(-32),
  );
  const secret = new Uint8Array(64);
  secret.set(seed, 0);
  secret.set(publicKeyBytes, 32);

  return { address: toBase58(publicKeyBytes), secretKeyBase58: toBase58(secret) };
}

/** Decodes base58; rejects non-alphabet characters. */
export function fromBase58(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let carry = ALPHABET.indexOf(input[i]);
    if (carry < 0) throw new Error(`invalid base58 character: ${input[i]}`);
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingOnes = 0;
  while (input[leadingOnes] === "1") leadingOnes++;
  const decoded = new Uint8Array(leadingOnes + bytes.length);
  decoded.set(bytes.reverse(), leadingOnes);
  return decoded;
}

const [command, secretInput] = process.argv.slice(2);

if (command === "--check") {
  if (import.meta.main) {
    const decoded = fromBase58(secretInput ?? "");
    if (decoded.length !== 64) throw new Error(`expected 64 bytes, got ${decoded.length}`);
    console.log(`Address derived from secret: ${toBase58(decoded.slice(32))}`);
  }
  process.exit(0);
}

if (import.meta.main) {
  const keypair = generateDevnetKeypair();
  console.log(`Address: ${keypair.address}`);
  console.log(`Secret key (base58): ${keypair.secretKeyBase58}`);
  console.log("\nNext steps:");
  console.log("  1. bun scripts/generate-devnet-wallet.ts --check <secret-from-above>");
  console.log("  2. Fund the address at https://faucet.solana.com");
  console.log("  3. Put the secret in SOLANA_SIGNER_SECRET (apps/server/.env, Render dashboard).");
}
