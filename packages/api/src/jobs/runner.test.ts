import { describe, expect, test } from "bun:test";

import type { Logger } from "../logger";
import { createJobRunner } from "./runner";

function recordingLogger() {
  const lines: { level: string; message: string; fields?: Record<string, unknown> }[] = [];
  const logger: Logger = {
    info: (message, fields) => lines.push({ level: "info", message, fields }),
    warn: (message, fields) => lines.push({ level: "warn", message, fields }),
    error: (message, fields) => lines.push({ level: "error", message, fields }),
  };
  return { logger, lines };
}

describe("createJobRunner", () => {
  test("runs a job outside the enqueue call and a drain awaits it", async () => {
    const { logger } = recordingLogger();
    const runner = createJobRunner(logger);
    let ran = false;
    runner.enqueue("probe", async () => {
      ran = true;
    });
    expect(ran).toBe(false);
    await runner.drain();
    expect(ran).toBe(true);
  });

  test("retries a failing job the configured number of times", async () => {
    const { logger, lines } = recordingLogger();
    const runner = createJobRunner(logger);
    let attempts = 0;
    runner.enqueue("flaky", async () => {
      attempts++;
      throw new Error("RPC sibuk");
    }, { attempts: 3 });
    await runner.drain();
    expect(attempts).toBe(3);
    expect(lines.filter((line) => line.level === "warn")).toHaveLength(2);
    expect(lines.filter((line) => line.level === "error")).toHaveLength(1);
  });

  test("calls onExhausted once after the final failure", async () => {
    const { logger } = recordingLogger();
    const runner = createJobRunner(logger);
    let exhausted = 0;
    runner.enqueue("anchor", async () => {
      throw new Error("gagal mencatat");
    }, { attempts: 2, onExhausted: () => { exhausted++; } });
    await runner.drain();
    expect(exhausted).toBe(1);
  });

  test("does not call onExhausted when the job succeeds", async () => {
    const { logger } = recordingLogger();
    const runner = createJobRunner(logger);
    let exhausted = 0;
    runner.enqueue("ok", async () => undefined, { attempts: 2, onExhausted: () => { exhausted++; } });
    await runner.drain();
    expect(exhausted).toBe(0);
  });
});
