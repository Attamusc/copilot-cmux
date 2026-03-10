import type { RuntimeState } from "../types.js"

export type ProgressPhase = "working" | "thinking" | "idle"

const BASE_PROGRESS = 0.08
const TOOL_WEIGHT = 0.72
const TOOL_STEEPNESS = 0.2
const TIME_WEIGHT = 0.15
const TIME_HALF_LIFE_MS = 90_000
const THINKING_FLOOR = 0.18

export function estimateProgress(
  state: RuntimeState,
  phase: ProgressPhase,
  now: number = Date.now(),
): number {
  if (phase === "idle") return 1

  const toolSignal =
    BASE_PROGRESS +
    TOOL_WEIGHT * (1 - 1 / (1 + state.toolInvocations * TOOL_STEEPNESS))

  let timeSignal = 0
  if (state.startedAt !== undefined) {
    const elapsed = Math.max(0, now - state.startedAt)
    timeSignal =
      TIME_WEIGHT * (1 - Math.exp((-elapsed * Math.LN2) / TIME_HALF_LIFE_MS))
  }

  let progress = Math.min(0.95, Math.max(0, toolSignal + timeSignal))

  if (phase === "thinking") {
    progress = Math.max(THINKING_FLOOR, progress)
  }

  return progress
}
