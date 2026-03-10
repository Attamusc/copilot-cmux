import assert from "node:assert/strict"
import test from "node:test"
import { loadConfig } from "../src/config.js"

test("loadConfig parses booleans and transport overrides", () => {
  const config = loadConfig({
    COPILOT_CMUX_BIN: "/usr/local/bin/cmux",
    COPILOT_CMUX_STATUS_KEY: "workspace-copilot",
    COPILOT_CMUX_TRANSPORT: "socket",
    COPILOT_CMUX_PROGRESS: "off",
    COPILOT_CMUX_KEEP_DONE_STATUS: "no",
    COPILOT_CMUX_LOG_PROMPTS: "0",
    COPILOT_CMUX_LOG_TOOLS: "false",
    COPILOT_CMUX_LOG_SESSION_LIFECYCLE: "yes",
    COPILOT_CMUX_NOTIFY_SESSION_END: "1",
    COPILOT_CMUX_NOTIFY_ERRORS: "true",
    COPILOT_CMUX_LOG_FILE_EDITS: "false",
    COPILOT_CMUX_DEBUG: "on",
  })

  assert.equal(config.cmuxBin, "/usr/local/bin/cmux")
  assert.equal(config.statusKey, "workspace-copilot")
  assert.equal(config.transport, "socket")
  assert.equal(config.progressEnabled, false)
  assert.equal(config.keepDoneStatus, false)
  assert.equal(config.logPrompts, false)
  assert.equal(config.logToolCalls, false)
  assert.equal(config.logSessionLifecycle, true)
  assert.equal(config.notifyOnSessionEnd, true)
  assert.equal(config.notifyOnErrors, true)
  assert.equal(config.logFileEdits, false)
  assert.equal(config.debug, true)
})
