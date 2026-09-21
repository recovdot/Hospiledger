import { expect, test } from "bun:test";
import { buildMemo } from "@hospiledger/shared";
import { getUtf8Decoder } from "@solana/kit";
import { SUPPORTED_MEMO_PROGRAM_ADDRESSES } from "@solana-program/memo";

import { buildMemoInstruction } from "./client";

const CONTENT_HASH = "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";

test("builds a version 4 memo instruction carrying the anchor text", () => {
  const memo = buildMemo({ assetCode: "HPL-2026-00001", version: 3, contentHash: CONTENT_HASH });
  const instruction = buildMemoInstruction(memo);

  expect(String(instruction.programAddress)).toBe("Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH");
  expect(SUPPORTED_MEMO_PROGRAM_ADDRESSES).toContain(instruction.programAddress);
  expect(getUtf8Decoder().decode(instruction.data)).toBe(memo);
  expect(instruction.accounts).toHaveLength(0);
});
