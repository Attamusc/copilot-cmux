import assert from "node:assert/strict"
import test from "node:test"
import { detectCmuxEnvironment } from "../src/cmux/detect.js"

test("empty env returns defaults", () => {
  const result = detectCmuxEnvironment({})

  assert.equal(result.workspaceID, undefined)
  assert.equal(result.surfaceID, undefined)
  assert.equal(result.socketPath, "/tmp/cmux.sock")
  assert.equal(result.isManagedWorkspace, false)
  assert.equal(result.termProgram, undefined)
})

test("with CMUX_WORKSPACE_ID marks managed workspace", () => {
  const result = detectCmuxEnvironment({ CMUX_WORKSPACE_ID: "ws-123" })

  assert.equal(result.workspaceID, "ws-123")
  assert.equal(result.isManagedWorkspace, true)
})

test("with CMUX_SURFACE_ID populates surfaceID", () => {
  const result = detectCmuxEnvironment({ CMUX_SURFACE_ID: "surface-abc" })

  assert.equal(result.surfaceID, "surface-abc")
})

test("with CMUX_SOCKET_PATH uses custom path", () => {
  const result = detectCmuxEnvironment({
    CMUX_SOCKET_PATH: "/run/user/1000/cmux.sock",
  })

  assert.equal(result.socketPath, "/run/user/1000/cmux.sock")
})

test("whitespace-only values treated as undefined", () => {
  const result = detectCmuxEnvironment({
    CMUX_WORKSPACE_ID: "  ",
    CMUX_SURFACE_ID: "  \t ",
  })

  assert.equal(result.workspaceID, undefined)
  assert.equal(result.surfaceID, undefined)
  assert.equal(result.isManagedWorkspace, false)
})

test("TERM_PROGRAM passed through", () => {
  const result = detectCmuxEnvironment({ TERM_PROGRAM: "tmux" })

  assert.equal(result.termProgram, "tmux")
})

test("hasSocket false when socket does not exist", () => {
  const result = detectCmuxEnvironment({
    CMUX_SOCKET_PATH: "/tmp/.cmux-nonexistent-test-socket",
  })

  assert.equal(result.hasSocket, false)
})
