import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, utimesSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createRuntimeState } from "../src/runtime/reducer.js"
import { cleanupStaleStateFiles, withRuntimeState } from "../src/runtime/state-store.js"

function uniqueCwd(): string {
  return `/tmp/test-state-${Date.now()}-${Math.random()}`
}

test("round-trip write and read", async () => {
  const cwd = uniqueCwd()
  const state = createRuntimeState(cwd, undefined, 1000)

  await withRuntimeState(cwd, undefined, async () => state)

  await withRuntimeState(cwd, undefined, async (current) => {
    // JSON round-trip drops undefined values, so compare via JSON
    assert.deepStrictEqual(current, JSON.parse(JSON.stringify(state)))
    return null // clean up
  })
})

test("null initial state", async () => {
  const cwd = uniqueCwd()

  await withRuntimeState(cwd, undefined, async (current) => {
    assert.strictEqual(current, null)
    return null
  })
})

test("returning null removes state file", async () => {
  const cwd = uniqueCwd()
  const state = createRuntimeState(cwd, undefined, 2000)

  // Write state
  await withRuntimeState(cwd, undefined, async () => state)

  // Remove by returning null
  await withRuntimeState(cwd, undefined, async () => null)

  // Verify it's gone
  await withRuntimeState(cwd, undefined, async (current) => {
    assert.strictEqual(current, null)
    return null
  })
})

test("different cwd produces different state", async () => {
  const cwdA = uniqueCwd()
  const cwdB = uniqueCwd()
  const state = createRuntimeState(cwdA, undefined, 3000)

  // Write under cwdA
  await withRuntimeState(cwdA, undefined, async () => state)

  // Read under cwdB → should be null
  await withRuntimeState(cwdB, undefined, async (current) => {
    assert.strictEqual(current, null)
    return null
  })

  // Clean up cwdA
  await withRuntimeState(cwdA, undefined, async () => null)
})

test("lock serialization", async () => {
  const cwd = uniqueCwd()
  const initial = createRuntimeState(cwd, undefined, 4000)

  await withRuntimeState(cwd, undefined, async () => initial)

  // Launch two concurrent updates that each bump toolInvocations
  const a = withRuntimeState(cwd, undefined, async (current) => {
    assert.ok(current !== null)
    return { ...current, toolInvocations: current.toolInvocations + 1 }
  })

  const b = withRuntimeState(cwd, undefined, async (current) => {
    assert.ok(current !== null)
    return { ...current, toolInvocations: current.toolInvocations + 1 }
  })

  await Promise.all([a, b])

  // Both completed without error; verify final state is consistent
  await withRuntimeState(cwd, undefined, async (current) => {
    assert.ok(current !== null)
    // With proper serialization, total should be 2 (each saw the prior write)
    assert.strictEqual(current.toolInvocations, 2)
    return null // clean up
  })
})

test("cleanupStaleStateFiles removes stale files and keeps recent ones", async () => {
  const dir = join(tmpdir(), "copilot-cmux")
  await mkdir(dir, { recursive: true })

  const stalePath = join(dir, "test-stale-cleanup.json")
  const freshPath = join(dir, "test-fresh-cleanup.json")

  const twoHoursAgo = Date.now() - 2 * 3_600_000
  await writeFile(stalePath, JSON.stringify({ updatedAt: twoHoursAgo }), "utf8")

  await cleanupStaleStateFiles(3_600_000)

  // Stale file should be removed
  let staleExists = true
  try {
    await readFile(stalePath)
  } catch {
    staleExists = false
  }
  assert.strictEqual(staleExists, false, "stale file should have been removed")

  // Write a fresh file and verify it survives cleanup
  await writeFile(freshPath, JSON.stringify({ updatedAt: Date.now() }), "utf8")

  await cleanupStaleStateFiles(3_600_000)

  const freshContent = await readFile(freshPath, "utf8")
  assert.ok(freshContent, "fresh file should still exist")

  // Clean up test file
  const { rm } = await import("node:fs/promises")
  await rm(freshPath, { force: true })
})

test("acquireLock recovers from stale lock left by crashed process", async () => {
  const cwd = uniqueCwd()
  const key = createHash("sha1").update(`${cwd}\u0000`).digest("hex")
  const lockPath = join(tmpdir(), "copilot-cmux", `${key}.lock`)

  // Ensure the root dir exists
  await mkdir(join(tmpdir(), "copilot-cmux"), { recursive: true })

  // Simulate a crashed process: create the lock dir and backdate its mtime by 60s
  mkdirSync(lockPath)
  const sixtySecondsAgo = Date.now() / 1000 - 60
  utimesSync(lockPath, sixtySecondsAgo, sixtySecondsAgo)

  // withRuntimeState should recover from the stale lock, not time out
  await withRuntimeState(cwd, undefined, async (current) => {
    assert.strictEqual(current, null)
    return null
  })
})

test("stale lock is cleaned up automatically", async () => {
  const cwd = uniqueCwd()
  const rootDir = join(tmpdir(), "copilot-cmux")
  const key = createHash("sha1").update(`${cwd}\u0000`).digest("hex")
  const lockPath = join(rootDir, `${key}.lock`)

  await mkdir(rootDir, { recursive: true })

  // Create a stale lock directory and set its mtime to 60s ago
  mkdirSync(lockPath, { recursive: true })
  const sixtySecondsAgo = Date.now() / 1000 - 60
  utimesSync(lockPath, sixtySecondsAgo, sixtySecondsAgo)

  // withRuntimeState should succeed despite the stale lock
  await withRuntimeState(cwd, undefined, async (current) => {
    assert.strictEqual(current, null)
    return null
  })
})
