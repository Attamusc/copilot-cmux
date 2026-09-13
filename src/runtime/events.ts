import { basename } from "node:path"
import { summarizeText } from "../text.js"
import type {
  AgentStopHookInput,
  ErrorOccurredHookInput,
  HookName,
  PostToolUseHookInput,
  PreToolUseHookInput,
  SessionEndHookInput,
  SessionEndReason,
  SessionStartHookInput,
  SessionStartSource,
  ToolResult,
  ToolResultType,
  UserPromptSubmittedHookInput,
} from "../types.js"

export type CopilotHookEvent =
  | ({ type: "session.start" } & SessionStartHookInput)
  | ({ type: "session.end" } & SessionEndHookInput)
  | ({ type: "user.prompt" } & UserPromptSubmittedHookInput)
  | ({ type: "agent.stop" } & AgentStopHookInput)
  | ({
      type: "tool.pre"
      summary: string
      parsedToolArgs: Record<string, unknown> | undefined
    } & Omit<PreToolUseHookInput, "toolArgs">)
  | ({
      type: "tool.post"
      summary: string
      parsedToolArgs: Record<string, unknown> | undefined
      resultType: ToolResultType
      resultText: string | undefined
    } & Omit<PostToolUseHookInput, "toolArgs" | "toolResult">)
  | ({ type: "error.occurred" } & ErrorOccurredHookInput)

function expectObject(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be a JSON object`)
  }

  return value as Record<string, unknown>
}

function expectString(object: Record<string, unknown>, key: string, context: string): string {
  const value = object[key]
  if (typeof value !== "string") {
    const presentKeys = Object.keys(object).join(", ")
    throw new Error(`${context}.${key} must be a string (present keys: ${presentKeys})`)
  }
  return value
}

function optionalString(object: Record<string, unknown>, key: string): string | undefined {
  const value = object[key]
  return typeof value === "string" ? value : undefined
}

function expectNumber(object: Record<string, unknown>, key: string, context: string): number {
  const value = object[key]
  if (typeof value !== "number" || !Number.isFinite(value)) {
    const presentKeys = Object.keys(object).join(", ")
    throw new Error(`${context}.${key} must be a finite number (present keys: ${presentKeys})`)
  }
  return value
}

function parseJsonObjectString(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return undefined
  }

  return undefined
}

function parseSessionStartSource(value: string): SessionStartSource {
  if (value === "new" || value === "resume" || value === "startup") {
    return value
  }
  // Be lenient: an unrecognised source must not break status rendering.
  return "new"
}

function parseSessionEndReason(value: string): SessionEndReason {
  if (
    value === "complete" ||
    value === "error" ||
    value === "abort" ||
    value === "timeout" ||
    value === "user_exit"
  ) {
    return value
  }
  return "complete"
}

function parseToolResult(value: unknown): ToolResult | undefined {
  if (value === undefined) return undefined

  const object = expectObject(value, "toolResult")
  const resultType = object.resultType
  if (resultType !== "success" && resultType !== "failure" && resultType !== "denied") {
    throw new Error("toolResult.resultType must be success, failure, or denied")
  }

  return {
    resultType,
    textResultForLlm: optionalString(object, "textResultForLlm"),
  }
}

export function describeToolCall(
  toolName: string,
  parsedToolArgs?: Record<string, unknown>,
): string {
  const description =
    typeof parsedToolArgs?.description === "string"
      ? summarizeText(parsedToolArgs.description, 48)
      : undefined
  if (description) {
    return `${toolName}: ${description}`
  }

  const path = typeof parsedToolArgs?.path === "string" ? parsedToolArgs.path : undefined
  if (path) {
    return `${toolName} ${basename(path)}`
  }

  return toolName
}

export function parseHookInput(hookName: HookName, rawInput: string): CopilotHookEvent {
  const context = `${hookName} input`

  let raw: unknown
  try {
    raw = JSON.parse(rawInput || "{}")
  } catch (cause) {
    const preview = rawInput.length > 120 ? `${rawInput.slice(0, 120)}…` : rawInput
    throw new Error(
      `Failed to parse ${hookName} input as JSON: ${cause instanceof Error ? cause.message : String(cause)}. Received: ${preview}`,
    )
  }
  const parsed = expectObject(raw, context)
  const sessionId = optionalString(parsed, "sessionId") ?? optionalString(parsed, "session_id")

  switch (hookName) {
    case "sessionStart": {
      return {
        type: "session.start",
        sessionId,
        timestamp: expectNumber(parsed, "timestamp", context),
        cwd: expectString(parsed, "cwd", context),
        source: parseSessionStartSource(expectString(parsed, "source", context)),
        initialPrompt: optionalString(parsed, "initialPrompt"),
      }
    }

    case "sessionEnd": {
      return {
        type: "session.end",
        sessionId,
        timestamp: expectNumber(parsed, "timestamp", context),
        cwd: expectString(parsed, "cwd", context),
        reason: parseSessionEndReason(expectString(parsed, "reason", context)),
      }
    }

    case "userPromptSubmitted": {
      return {
        type: "user.prompt",
        sessionId,
        timestamp: expectNumber(parsed, "timestamp", context),
        cwd: expectString(parsed, "cwd", context),
        prompt: expectString(parsed, "prompt", context),
      }
    }

    case "agentStop": {
      return {
        type: "agent.stop",
        sessionId,
        timestamp: expectNumber(parsed, "timestamp", context),
        cwd: expectString(parsed, "cwd", context),
        stopReason: optionalString(parsed, "stopReason"),
      }
    }

    case "preToolUse": {
      const toolName = expectString(parsed, "toolName", context)
      const toolArgs = optionalString(parsed, "toolArgs") ?? ""
      const parsedToolArgs = parseJsonObjectString(toolArgs)

      return {
        type: "tool.pre",
        sessionId,
        timestamp: expectNumber(parsed, "timestamp", context),
        cwd: expectString(parsed, "cwd", context),
        toolName,
        parsedToolArgs,
        summary: describeToolCall(toolName, parsedToolArgs),
      }
    }

    case "postToolUse": {
      const toolName = expectString(parsed, "toolName", context)
      const toolArgs = optionalString(parsed, "toolArgs") ?? ""
      const parsedToolArgs = parseJsonObjectString(toolArgs)
      const toolResult = parseToolResult(parsed.toolResult)

      return {
        type: "tool.post",
        sessionId,
        timestamp: expectNumber(parsed, "timestamp", context),
        cwd: expectString(parsed, "cwd", context),
        toolName,
        parsedToolArgs,
        summary: describeToolCall(toolName, parsedToolArgs),
        resultType: toolResult?.resultType ?? "success",
        resultText: toolResult?.textResultForLlm,
      }
    }

    case "errorOccurred": {
      const error = expectObject(parsed.error, `${context}.error`)
      return {
        type: "error.occurred",
        sessionId,
        timestamp: expectNumber(parsed, "timestamp", context),
        cwd: expectString(parsed, "cwd", context),
        error: {
          message: expectString(error, "message", `${context}.error`),
          name: optionalString(error, "name"),
          stack: optionalString(error, "stack"),
        },
      }
    }
  }
}
