import assert from "node:assert/strict"
import test from "node:test"
import { estimateProgress } from "../src/runtime/progress.js"
import { createRuntimeState } from "../src/runtime/reducer.js"
import type { RuntimeState } from "../src/types.js"

function buildState(overrides: Partial<RuntimeState> = {}): RuntimeState {
  return { ...createRuntimeState("/tmp", "ws-1", 1000), ...overrides }
}

test("idle phase returns 1", () => {
  const state = buildState()
  assert.equal(estimateProgress(state, "idle"), 1)
})

test("working at t=0 with 0 tools returns BASE_PROGRESS", () => {
  const now = 5000
  const state = buildState({ startedAt: now, toolInvocations: 0 })
  assert.equal(estimateProgress(state, "working", now), 0.08)
})

test("working with tool invocations increases progress", () => {
  const now = 5000
  const base = buildState({ startedAt: now, toolInvocations: 0 })
  const withTools = buildState({ startedAt: now, toolInvocations: 5 })
  assert.ok(estimateProgress(withTools, "working", now) > estimateProgress(base, "working", now))
})

test("time signal increases with elapsed time", () => {
  const start = 1000
  const state = buildState({ startedAt: start, toolInvocations: 0 })
  const early = estimateProgress(state, "working", start)
  const later = estimateProgress(state, "working", start + 90_000)
  assert.ok(later > early)
})

test("thinking floor respected", () => {
  const now = 5000
  const state = buildState({ startedAt: now, toolInvocations: 0 })
  const progress = estimateProgress(state, "thinking", now)
  assert.ok(progress >= 0.18)
})

test("progress never exceeds 0.95", () => {
  const start = 1000
  const state = buildState({ startedAt: start, toolInvocations: 500 })
  const progress = estimateProgress(state, "working", start + 1_000_000)
  assert.ok(progress <= 0.95)
})

test("no startedAt means no time signal", () => {
  const state = buildState({ startedAt: undefined, toolInvocations: 3 })
  const withStart = buildState({ startedAt: 1000, toolInvocations: 3 })
  const noTime = estimateProgress(state, "working", 1000 + 90_000)
  const withTime = estimateProgress(withStart, "working", 1000 + 90_000)
  assert.ok(withTime > noTime)
})

test("monotonically increases with more tool invocations", () => {
  const now = 5000
  for (let n = 0; n < 20; n++) {
    const stateN = buildState({ startedAt: now, toolInvocations: n })
    const stateN1 = buildState({ startedAt: now, toolInvocations: n + 1 })
    assert.ok(
      estimateProgress(stateN1, "working", now) > estimateProgress(stateN, "working", now),
      `progress at ${n + 1} tools should exceed progress at ${n} tools`,
    )
  }
})
