import assert from "node:assert/strict"
import test from "node:test"
import { createRuntimeState } from "../src/runtime/reducer.js"
import { buildPresentationSnapshot } from "../src/runtime/renderer.js"

const config = {
  cmuxBin: "cmux",
  statusKey: "copilot",
  transport: "auto" as const,
  progressEnabled: true,
  keepDoneStatus: true,
  logPrompts: true,
  logToolCalls: true,
  logSessionLifecycle: true,
  notifyOnSessionEnd: true,
  notifyOnErrors: true,
  debug: false,
}

function state(overrides: Record<string, unknown> = {}) {
  return { ...createRuntimeState("/tmp/project", "ws-1", 1), ...overrides }
}

test("idle phase with no active tools returns empty snapshot", () => {
  const snap = buildPresentationSnapshot(state(), config, "proj", 10)
  assert.deepStrictEqual(snap, {})
})

test("thinking phase returns sparkles status with progress", () => {
  const snap = buildPresentationSnapshot(
    state({ phase: "thinking", startedAt: 1, lastPrompt: "Fix it" }),
    config,
    "proj",
    10,
  )
  assert.equal(snap.status?.text, "thinking")
  assert.equal(snap.status?.icon, "sparkles")
  assert.equal(snap.status?.color, "#0ea5e9")
  assert.ok(snap.progress)
  assert.equal(typeof snap.progress.value, "number")
  assert.equal(typeof snap.progress.label, "string")
})

test("working with single tool shows tool summary", () => {
  const snap = buildPresentationSnapshot(
    state({
      phase: "working",
      startedAt: 1,
      activeTools: { edit: 1 },
      toolInvocations: 1,
      completedTools: 0,
      lastToolName: "edit",
      lastToolSummary: "edit: Update file",
    }),
    config,
    "proj",
    10,
  )
  assert.equal(snap.status?.text, "working: edit: Update file")
  assert.equal(snap.status?.icon, "terminal")
  assert.equal(snap.status?.color, "#f59e0b")
  assert.ok(snap.progress)
})

test("working with multiple tools shows tool count", () => {
  const snap = buildPresentationSnapshot(
    state({
      phase: "working",
      startedAt: 1,
      activeTools: { bash: 1, edit: 1 },
      toolInvocations: 3,
      completedTools: 1,
      lastToolName: "edit",
      lastToolSummary: "edit: Update file",
    }),
    config,
    "proj",
    10,
  )
  assert.equal(snap.status?.text, "working: 2 tools")
  assert.equal(snap.status?.icon, "terminal")
  assert.equal(snap.status?.color, "#f59e0b")
  assert.ok(snap.progress)
})

test("error phase returns alert status without progress", () => {
  const snap = buildPresentationSnapshot(
    state({
      phase: "error",
      lastError: { message: "boom", name: "Error" },
    }),
    config,
    "proj",
    10,
  )
  assert.equal(snap.status?.text, "error")
  assert.equal(snap.status?.icon, "alert-circle")
  assert.equal(snap.status?.color, "#ef4444")
  assert.equal(snap.progress, undefined)
})

test("done phase with keepDoneStatus true returns done status", () => {
  const snap = buildPresentationSnapshot(
    state({ phase: "done", lastSessionEndReason: "complete" }),
    { ...config, keepDoneStatus: true },
    "proj",
    10,
  )
  assert.equal(snap.status?.text, "done")
  assert.equal(snap.status?.icon, "check-circle")
  assert.equal(snap.status?.color, "#22c55e")
})

test("done phase with keepDoneStatus false returns empty snapshot", () => {
  const snap = buildPresentationSnapshot(
    state({ phase: "done", lastSessionEndReason: "complete" }),
    { ...config, keepDoneStatus: false },
    "proj",
    10,
  )
  assert.deepStrictEqual(snap, {})
})

test("thinking with progressEnabled false has status but no progress", () => {
  const snap = buildPresentationSnapshot(
    state({ phase: "thinking", startedAt: 1, lastPrompt: "Fix it" }),
    { ...config, progressEnabled: false },
    "proj",
    10,
  )
  assert.equal(snap.status?.text, "thinking")
  assert.equal(snap.progress, undefined)
})

test("working with progressEnabled false has status but no progress", () => {
  const snap = buildPresentationSnapshot(
    state({
      phase: "working",
      startedAt: 1,
      activeTools: { bash: 1 },
      toolInvocations: 1,
      completedTools: 0,
      lastToolName: "bash",
      lastToolSummary: "bash: ls",
    }),
    { ...config, progressEnabled: false },
    "proj",
    10,
  )
  assert.equal(snap.status?.text, "working: bash: ls")
  assert.equal(snap.progress, undefined)
})

test("progress label includes project label", () => {
  const snap = buildPresentationSnapshot(
    state({ phase: "thinking", startedAt: 1, lastPrompt: "Hello" }),
    config,
    "my-project",
    10,
  )
  assert.ok(snap.progress)
  assert.ok(
    snap.progress.label.startsWith("my-project:"),
    `expected label to start with "my-project:", got "${snap.progress.label}"`,
  )
})
