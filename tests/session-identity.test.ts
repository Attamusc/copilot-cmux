import assert from "node:assert/strict"
import test from "node:test"
import { isPrimarySessionID } from "../src/runtime/session-identity.js"

test("UUID session ids are treated as primary", () => {
  assert.equal(isPrimarySessionID("5ac0f847-bf66-4c99-b9d2-8d3baf0450dd"), true)
})

test("sidekick sessions are not primary", () => {
  assert.equal(isPrimarySessionID("sidekick-github-context-memory-1786096679533"), false)
})

test("subagent tool-call sessions are not primary", () => {
  assert.equal(isPrimarySessionID("toolu_01FoQ1GrB5vcHk8MPpxGFD4i"), false)
})

test("missing session id is allowed through", () => {
  assert.equal(isPrimarySessionID(undefined), true)
})

test("unknown id shapes fail open rather than disabling the plugin", () => {
  assert.equal(isPrimarySessionID("some-future-format-42"), true)
})
