import { summarizeTextWithFallback } from "../text.js"
import type { PluginConfig, PresentationSnapshot, ProgressPayload, RuntimeState } from "../types.js"
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

function isBusy(state: RuntimeState): boolean {
  return state.phase === "thinking" || state.phase === "working"
}

/**
 * The cmux progress bar is a single per-workspace resource with no key, so
 * every tab in a workspace writes to the same bar. Rather than letting tabs
 * fight (last writer wins, producing a flickering bar), each tab renders the
 * same aggregate computed from all sibling states — so the result is identical
 * regardless of which tab writes last.
 */
export function buildWorkspaceProgress(
  ownState: RuntimeState,
  siblings: RuntimeState[],
  config: PluginConfig,
  projectLabel: string,
  now: number = Date.now(),
): ProgressPayload | undefined {
  if (!config.progressEnabled) return undefined

  const busy = [ownState, ...siblings].filter(isBusy)
  if (busy.length === 0) return undefined

  if (busy.length === 1) {
    const only = busy[0] as RuntimeState
    return {
      value: estimateProgress(only, only.phase === "working" ? "working" : "thinking", now),
      label: buildProgressLabel(only, projectLabel),
    }
  }

  const value = Math.max(
    ...busy.map((state) =>
      estimateProgress(state, state.phase === "working" ? "working" : "thinking", now),
    ),
  )
  return {
    value,
    label: `${projectLabel}: ${busy.length} tabs active`,
  }
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
    // Once the CLI itself exits the tab is going away, so drop the pill rather
    // than leaving an orphaned "done" entry behind for every closed tab.
    if (state.lastSessionEndReason !== undefined) {
      return {}
    }
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
