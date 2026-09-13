import assert from "node:assert/strict"
import test from "node:test"
import { createRuntimeState, reduceRuntimeState } from "../src/runtime/reducer.js"
import { buildWorkspaceProgress } from "../src/runtime/renderer.js"
import { readSiblingStates, withRuntimeState } from "../src/runtime/state-store.js"
import type { PluginConfig, RuntimeState } from "../src/types.js"

const config = { progressEnabled: true } as PluginConfig

function busy(overrides: Partial<RuntimeState>): RuntimeState {
  return { ...createRuntimeState("/tmp/project", "ws-1", 1), ...overrides }
}

test("two surfaces in one workspace keep independent state", async () => {
  const run = `${process.pid}-${Math.random()}`
  const cwd = `/tmp/project-${run}`

  await withRuntimeState(cwd, "ws-1", "surface-a", async () =>
    reduceRuntimeState(
      createRuntimeState(cwd, "ws-1", 1, "s-a"),
      {
        type: "tool.pre",
        sessionId: "s-a",
        timestamp: 2,
        cwd,
        toolName: "bash",
        summary: "bash",
        parsedToolArgs: undefined,
      },
      "ws-1",
    ),
  )

  // Surface B starts clean rather than inheriting surface A's active tool.
  let seenByB: RuntimeState | null = null
  await withRuntimeState(cwd, "ws-1", "surface-b", async (current) => {
    seenByB = current
    return createRuntimeState(cwd, "ws-1", 3, "s-b")
  })
  assert.equal(seenByB, null)

  // Surface A's in-flight tool survives surface B's activity.
  let seenByA: RuntimeState | null = null
  await withRuntimeState(cwd, "ws-1", "surface-a", async (current) => {
    seenByA = current
    return current
  })
  assert.deepEqual(seenByA?.activeTools, { bash: 1 })
})

test("sibling states are visible within a workspace but not across workspaces", async () => {
  // Workspace ids must be unique per run: state files are grouped by workspace
  // in a shared tmp directory, so reusing a fixed id leaks between test runs.
  const run = `${process.pid}-${Math.random()}`
  const cwd = `/tmp/project-${run}`
  const wsA = `ws-A-${run}`
  const wsB = `ws-B-${run}`

  await withRuntimeState(cwd, wsA, "surface-1", async () =>
    createRuntimeState(cwd, wsA, Date.now(), "s-1"),
  )
  await withRuntimeState(cwd, wsA, "surface-2", async () =>
    createRuntimeState(cwd, wsA, Date.now(), "s-2"),
  )
  await withRuntimeState(cwd, wsB, "surface-3", async () =>
    createRuntimeState(cwd, wsB, Date.now(), "s-3"),
  )

  const siblingsOf1 = await readSiblingStates(cwd, wsA, "surface-1")
  assert.equal(siblingsOf1.length, 1)
  assert.equal(siblingsOf1[0]?.sessionID, "s-2")

  const siblingsOf3 = await readSiblingStates(cwd, wsB, "surface-3")
  assert.equal(siblingsOf3.length, 0)
})

test("workspace progress aggregates instead of letting tabs fight", () => {
  const own = busy({ phase: "working", startedAt: 1, activeTools: { bash: 1 } })
  const sibling = busy({ phase: "thinking", startedAt: 1 })

  const progress = buildWorkspaceProgress(own, [sibling], config, "proj", 10)
  assert.equal(progress?.label, "proj: 2 tabs active")
})

test("workspace progress falls back to the single active tab", () => {
  const own = busy({ phase: "thinking", startedAt: 1, lastPrompt: "Fix it" })
  const idleSibling = busy({ phase: "idle" })

  const progress = buildWorkspaceProgress(own, [idleSibling], config, "proj", 10)
  assert.ok(progress)
  assert.ok(!progress?.label.includes("tabs active"))
})

test("progress clears only when no tab in the workspace is active", () => {
  const own = busy({ phase: "done" })
  assert.equal(
    buildWorkspaceProgress(own, [busy({ phase: "idle" })], config, "proj", 10),
    undefined,
  )

  // A still-working sibling keeps the shared bar alive.
  const withActiveSibling = buildWorkspaceProgress(
    own,
    [busy({ phase: "working", startedAt: 1, activeTools: { bash: 1 } })],
    config,
    "proj",
    10,
  )
  assert.ok(withActiveSibling)
})
