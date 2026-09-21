export type LogFields = Record<string, unknown>;

/** Structured logger. Implementations write one record per call; no `console.log` in service code. */
export type Logger = {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};
