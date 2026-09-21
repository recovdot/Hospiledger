import type { LogFields, Logger } from "@hospiledger/api/logger";

/**
 * Creates the structured stdout logger. One JSON record per line, never `console.log`.
 *
 * @returns the logger
 */
export function createLogger(): Logger {
  const write = (level: "info" | "warn" | "error", message: string, fields?: LogFields) => {
    process.stdout.write(`${JSON.stringify({ level, time: new Date().toISOString(), message, ...fields })}\n`);
  };
  return {
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}
