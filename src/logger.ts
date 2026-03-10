import type { HookLogger, LogLevel } from "./types.js"

export function createLogger(debugEnabled: boolean): HookLogger {
  return {
    async log(level: LogLevel, message: string, extra?: Record<string, unknown>) {
      if (!debugEnabled && (level === "debug" || level === "info")) {
        return
      }

      const details = extra ? ` ${JSON.stringify(extra)}` : ""
      process.stderr.write(`[copilot-cmux] ${level}: ${message}${details}\n`)
    },
  }
}
