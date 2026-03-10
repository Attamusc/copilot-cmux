import type { PluginConfig, TransportMode } from "./types.js"

const TRUE_VALUES = new Set(["1", "true", "yes", "on"])
const FALSE_VALUES = new Set(["0", "false", "no", "off"])

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback

  const normalized = value.trim().toLowerCase()
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return fallback
}

function parseTransport(value: string | undefined, fallback: TransportMode): TransportMode {
  if (!value) return fallback

  const normalized = value.trim().toLowerCase()
  if (normalized === "cli" || normalized === "socket" || normalized === "auto") {
    return normalized
  }

  return fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PluginConfig {
  return {
    cmuxBin: env.COPILOT_CMUX_BIN?.trim() || "cmux",
    statusKey: env.COPILOT_CMUX_STATUS_KEY?.trim() || "copilot",
    transport: parseTransport(env.COPILOT_CMUX_TRANSPORT, "auto"),
    progressEnabled: parseBoolean(env.COPILOT_CMUX_PROGRESS, true),
    keepDoneStatus: parseBoolean(env.COPILOT_CMUX_KEEP_DONE_STATUS, true),
    logPrompts: parseBoolean(env.COPILOT_CMUX_LOG_PROMPTS, true),
    logToolCalls: parseBoolean(env.COPILOT_CMUX_LOG_TOOLS, true),
    logSessionLifecycle: parseBoolean(env.COPILOT_CMUX_LOG_SESSION_LIFECYCLE, true),
    notifyOnSessionEnd: parseBoolean(env.COPILOT_CMUX_NOTIFY_SESSION_END, true),
    notifyOnErrors: parseBoolean(env.COPILOT_CMUX_NOTIFY_ERRORS, true),
    logFileEdits: parseBoolean(env.COPILOT_CMUX_LOG_FILE_EDITS, true),
    debug: parseBoolean(env.COPILOT_CMUX_DEBUG, false),
  }
}
