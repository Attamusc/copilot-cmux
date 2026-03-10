import type { RuntimeState } from "../types.js"
import type { CopilotHookEvent } from "./events.js"

export function createRuntimeState(
  cwd: string,
  workspaceID?: string,
  timestamp: number = Date.now(),
): RuntimeState {
  return {
    version: 1,
    cwd,
    workspaceID,
    updatedAt: timestamp,
    startedAt: undefined,
    source: undefined,
    phase: "idle",
    lastPrompt: undefined,
    activeTools: {},
    toolInvocations: 0,
    completedTools: 0,
    lastToolName: undefined,
    lastToolSummary: undefined,
    lastResultType: undefined,
    lastError: undefined,
    lastSessionEndReason: undefined,
  }
}

export function countActiveTools(state: RuntimeState): number {
  return Object.values(state.activeTools).reduce((sum, count) => sum + count, 0)
}

export function describeActiveTools(state: RuntimeState): string | undefined {
  const total = countActiveTools(state)
  if (total === 0) return undefined
  if (total === 1) {
    return state.lastToolSummary ?? state.lastToolName ?? "tool"
  }
  return `${total} tools`
}

function cloneActiveTools(activeTools: Record<string, number>): Record<string, number> {
  return { ...activeTools }
}

function incrementToolCount(
  activeTools: Record<string, number>,
  toolName: string,
): Record<string, number> {
  const next = cloneActiveTools(activeTools)
  next[toolName] = (next[toolName] ?? 0) + 1
  return next
}

function decrementToolCount(
  activeTools: Record<string, number>,
  toolName: string,
): Record<string, number> {
  const next = cloneActiveTools(activeTools)
  const current = next[toolName] ?? 0
  if (current <= 1) {
    delete next[toolName]
  } else {
    next[toolName] = current - 1
  }
  return next
}

export function reduceRuntimeState(
  currentState: RuntimeState,
  event: CopilotHookEvent,
  workspaceID?: string,
): RuntimeState {
  switch (event.type) {
    case "session.start": {
      return {
        version: 1,
        cwd: event.cwd,
        workspaceID,
        updatedAt: event.timestamp,
        startedAt: event.timestamp,
        source: event.source,
        phase: event.initialPrompt ? "thinking" : "idle",
        lastPrompt: event.initialPrompt,
        activeTools: {},
        toolInvocations: 0,
        completedTools: 0,
        lastToolName: undefined,
        lastToolSummary: undefined,
        lastResultType: undefined,
        lastError: undefined,
        lastSessionEndReason: undefined,
      }
    }

    case "user.prompt": {
      return {
        ...currentState,
        cwd: event.cwd,
        workspaceID,
        updatedAt: event.timestamp,
        startedAt: currentState.startedAt ?? event.timestamp,
        phase: countActiveTools(currentState) > 0 ? "working" : "thinking",
        lastPrompt: event.prompt,
        lastSessionEndReason: undefined,
        lastError: undefined,
      }
    }

    case "tool.pre": {
      return {
        ...currentState,
        cwd: event.cwd,
        workspaceID,
        updatedAt: event.timestamp,
        startedAt: currentState.startedAt ?? event.timestamp,
        phase: "working",
        activeTools: incrementToolCount(currentState.activeTools, event.toolName),
        toolInvocations: currentState.toolInvocations + 1,
        lastToolName: event.toolName,
        lastToolSummary: event.summary,
        lastResultType: undefined,
        lastSessionEndReason: undefined,
      }
    }

    case "tool.post": {
      const activeTools = decrementToolCount(currentState.activeTools, event.toolName)
      return {
        ...currentState,
        cwd: event.cwd,
        workspaceID,
        updatedAt: event.timestamp,
        startedAt: currentState.startedAt ?? event.timestamp,
        phase: countActiveTools({ ...currentState, activeTools }) > 0 ? "working" : "thinking",
        activeTools,
        completedTools: currentState.completedTools + 1,
        lastToolName: event.toolName,
        lastToolSummary: event.summary,
        lastResultType: event.resultType,
      }
    }

    case "session.end": {
      return {
        ...currentState,
        cwd: event.cwd,
        workspaceID,
        updatedAt: event.timestamp,
        phase:
          event.reason === "complete"
            ? "done"
            : event.reason === "error"
              ? "error"
              : "idle",
        activeTools: {},
        lastSessionEndReason: event.reason,
      }
    }

    case "error.occurred": {
      return {
        ...currentState,
        cwd: event.cwd,
        workspaceID,
        updatedAt: event.timestamp,
        phase: "error",
        lastError: {
          message: event.error.message,
          name: event.error.name,
        },
      }
    }
  }
}
