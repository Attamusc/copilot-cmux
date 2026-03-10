import assert from "node:assert/strict"
import test from "node:test"
import {
  buildNotifyCommand,
  buildSetStatusCommand,
  buildSocketNotify,
  buildSocketSetProgress,
  buildSocketSetStatus,
  parseCmuxResponse,
} from "../src/cmux/commands.js"

test("buildSetStatusCommand includes workspace and icon metadata", () => {
  assert.deepEqual(
    buildSetStatusCommand(
      "copilot",
      { text: "thinking", icon: "sparkles", color: "#0ea5e9" },
      "workspace-123",
    ),
    [
      "set-status",
      "copilot",
      "thinking",
      "--icon",
      "sparkles",
      "--color",
      "#0ea5e9",
      "--workspace",
      "workspace-123",
    ],
  )
})

test("buildSocketSetStatus quotes text with spaces", () => {
  assert.equal(
    buildSocketSetStatus(
      "copilot",
      { text: "working: bash: Run tests", icon: "terminal", color: "#f59e0b" },
      "workspace-123",
    ),
    'set_status copilot "working: bash: Run tests" --icon=terminal --color=#f59e0b --tab=workspace-123\n',
  )
})

test("buildSocketSetStatus does not quote text without spaces", () => {
  assert.equal(
    buildSocketSetStatus(
      "copilot",
      { text: "thinking", icon: "sparkles", color: "#0ea5e9" },
      "workspace-123",
    ),
    "set_status copilot thinking --icon=sparkles --color=#0ea5e9 --tab=workspace-123\n",
  )
})

test("buildSocketSetProgress renders a newline-terminated command", () => {
  assert.equal(
    buildSocketSetProgress({ value: 0.42, label: "repo: thinking" }, "workspace-123"),
    'set_progress 0.42 --label="repo: thinking" --tab=workspace-123\n',
  )
})

test("buildSocketNotify emits JSON-RPC with workspace and parser handles cmux responses", () => {
  const payload = buildSocketNotify(
    { title: "Done: repo", body: "Copilot session complete" },
    "req-1",
    "workspace-123",
  )
  assert.match(payload, /"method":"notification.create"/)
  assert.match(payload, /"workspace_id":"workspace-123"/)
  assert.deepEqual(parseCmuxResponse('{"id":"req-1","ok":true}'), {
    id: "req-1",
    ok: true,
  })
})

test("buildNotifyCommand includes workspace flag", () => {
  assert.deepEqual(
    buildNotifyCommand({ title: "Done: repo", body: "Copilot session complete" }, "workspace-123"),
    [
      "notify",
      "--title",
      "Done: repo",
      "--body",
      "Copilot session complete",
      "--workspace",
      "workspace-123",
    ],
  )
})

test("buildNotifyCommand omits workspace when undefined", () => {
  assert.deepEqual(buildNotifyCommand({ title: "Done: repo" }), ["notify", "--title", "Done: repo"])
})
