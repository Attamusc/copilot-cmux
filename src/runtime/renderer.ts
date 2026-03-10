import { summarizeTextWithFallback } from "../text.js"
import type { PluginConfig, PresentationSnapshot, RuntimeState } from "../types.js"
import { estimateProgress } from "./progress.js"
import { describeActiveTools } from "./reducer.js"

function buildProgressLabel(state: RuntimeState, projectLabel: string): string {
  const activeTool = describeActiveTools(state)
  if (activeTool) {
    return `${projectLabel}: ${activeTool}`
  }

  if (state.phase === "thinking") {
    return `${projectLabel}: ${summarizeTextWithFallback(state.lastPrompt, "thinking")}`
  }

  return `${projectLabel}: working`
}

export function buildPresentationSnapshot(
  state: RuntimeState,
  config: PluginConfig,
  projectLabel: string,
  now: number = Date.now(),
): PresentationSnapshot {
  if (state.phase === "error") {
    return {
      status: {
        text: "error",
        icon: "alert-circle",
        color: "#ef4444",
      },
    }
  }

  const activeTool = describeActiveTools(state)
  if (activeTool) {
    const progress = config.progressEnabled
      ? {
          value: estimateProgress(state, "working", now),
          label: buildProgressLabel(state, projectLabel),
        }
      : undefined
    return {
      status: {
        text: `working: ${activeTool}`,
        icon: "terminal",
        color: "#f59e0b",
      },
      ...(progress ? { progress } : {}),
    }
  }

  if (state.phase === "thinking") {
    const progress = config.progressEnabled
      ? {
          value: estimateProgress(state, "thinking", now),
          label: buildProgressLabel(state, projectLabel),
        }
      : undefined
    return {
      status: {
        text: "thinking",
        icon: "sparkles",
        color: "#0ea5e9",
      },
      ...(progress ? { progress } : {}),
    }
  }

  if (state.phase === "done" && config.keepDoneStatus) {
    return {
      status: {
        text: "done",
        icon: "check-circle",
        color: "#22c55e",
      },
    }
  }

  return {}
}
