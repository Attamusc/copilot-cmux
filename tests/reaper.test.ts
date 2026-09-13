import assert from "node:assert/strict"
import test from "node:test"
import { parseStatusKeys, parseSurfaceIDs } from "../src/cmux/commands.js"
import { findOrphanedStatusKeys } from "../src/runtime/reaper.js"

const LIVE = "0947C04D-E74D-4AF5-8864-9A4D2B18531A"
const DEAD_A = "D40514A2-E8F8-4FEA-AE35-E4E110F8BBBB"
const DEAD_B = "33863403-C1A1-499D-BE39-C13E9A1A3EE6"

test("finds pills whose surface no longer exists", () => {
  const orphaned = findOrphanedStatusKeys(
    "copilot",
    [`copilot.${LIVE}`, `copilot.${DEAD_A}`, `copilot.${DEAD_B}`],
    [LIVE],
  )
  assert.deepEqual(orphaned, [`copilot.${DEAD_A}`, `copilot.${DEAD_B}`])
})

test("never reaps the unkeyed status entry", () => {
  // cmux publishes its own unkeyed `copilot` pill. It is not ours to delete.
  const orphaned = findOrphanedStatusKeys("copilot", ["copilot", `copilot.${DEAD_A}`], [LIVE])
  assert.deepEqual(orphaned, [`copilot.${DEAD_A}`])
})

test("never reaps keys belonging to other integrations", () => {
  const orphaned = findOrphanedStatusKeys(
    "copilot",
    ["claude.abc", "other-tool", `copilotx.${DEAD_A}`, `copilot.${DEAD_A}`],
    [LIVE],
  )
  assert.deepEqual(orphaned, [`copilot.${DEAD_A}`])
})

test("reaps nothing when the live surface list is empty", () => {
  // An empty list means the lookup failed, not that every surface died.
  // Reaping here would wipe the whole workspace's pills.
  const orphaned = findOrphanedStatusKeys("copilot", [`copilot.${LIVE}`, `copilot.${DEAD_A}`], [])
  assert.deepEqual(orphaned, [])
})

test("reaps nothing when every surface is alive", () => {
  const orphaned = findOrphanedStatusKeys(
    "copilot",
    [`copilot.${LIVE}`, `copilot.${DEAD_A}`],
    [LIVE, DEAD_A],
  )
  assert.deepEqual(orphaned, [])
})

test("respects a custom status key", () => {
  const orphaned = findOrphanedStatusKeys("agent", [`agent.${DEAD_A}`, `copilot.${DEAD_A}`], [LIVE])
  assert.deepEqual(orphaned, [`agent.${DEAD_A}`])
})

test("ignores a bare prefix with no surface id", () => {
  const orphaned = findOrphanedStatusKeys("copilot", ["copilot."], [LIVE])
  assert.deepEqual(orphaned, [])
})

test("parseStatusKeys reads real list_status output", () => {
  const raw = [
    `copilot.${LIVE}=done icon=check-circle color=#22c55e`,
    `copilot.${DEAD_A}=working: bash icon=terminal color=#f59e0b`,
    "copilot=Idle icon=pause.circle.fill color=#8E8E93",
  ].join("\n")

  assert.deepEqual(parseStatusKeys(raw), [`copilot.${LIVE}`, `copilot.${DEAD_A}`, "copilot"])
})

test("parseStatusKeys tolerates errors and blank lines", () => {
  assert.deepEqual(parseStatusKeys("ERROR: Tab not found"), [])
  assert.deepEqual(parseStatusKeys(""), [])
  assert.deepEqual(parseStatusKeys("\n\n"), [])
})

test("parseSurfaceIDs reads real list_surfaces output", () => {
  // The selected surface is marked with a leading asterisk.
  const raw = [`  0: ${DEAD_A}`, `* 1: ${LIVE}`, `  2: ${DEAD_B}`].join("\n")
  assert.deepEqual(parseSurfaceIDs(raw), [DEAD_A, LIVE, DEAD_B])
})

test("parseSurfaceIDs tolerates errors and blank output", () => {
  assert.deepEqual(parseSurfaceIDs("ERROR: Tab not found"), [])
  assert.deepEqual(parseSurfaceIDs(""), [])
})

test("a failed surface lookup cannot cause a reap", () => {
  // End-to-end of the guard: list_status succeeded, list_surfaces errored.
  const keys = parseStatusKeys(`copilot.${LIVE}=done icon=check-circle color=#22c55e`)
  const live = parseSurfaceIDs("ERROR: Tab not found")
  assert.deepEqual(findOrphanedStatusKeys("copilot", keys, live), [])
})
