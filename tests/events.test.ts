import assert from "node:assert/strict"
import test from "node:test"
import { describeToolCall, parseHookInput } from "../src/runtime/events.js"
import { summarizeText, summarizeTextWithFallback } from "../src/text.js"

// ---------------------------------------------------------------------------
// parseHookInput
// ---------------------------------------------------------------------------

test("parseHookInput — sessionStart: returns event with correct fields", () => {
  const raw = JSON.stringify({
    timestamp: 1700000000,
    cwd: "/home/user/project",
    source: "new",
    initialPrompt: "hello world",
  })
  const event = parseHookInput("sessionStart", raw)
  assert.equal(event.type, "session.start")
  assert.equal(event.timestamp, 1700000000)
  assert.equal(event.cwd, "/home/user/project")
  assert.equal(event.type === "session.start" && event.source, "new")
  assert.equal(event.type === "session.start" && event.initialPrompt, "hello world")
})

test("parseHookInput — sessionEnd: returns event with correct reason", () => {
  const raw = JSON.stringify({
    timestamp: 1700000001,
    cwd: "/tmp",
    reason: "complete",
  })
  const event = parseHookInput("sessionEnd", raw)
  assert.equal(event.type, "session.end")
  assert.equal(event.timestamp, 1700000001)
  assert.equal(event.type === "session.end" && event.reason, "complete")
})

test("parseHookInput — userPromptSubmitted: returns event with prompt", () => {
  const raw = JSON.stringify({
    timestamp: 1700000002,
    cwd: "/tmp",
    prompt: "fix the bug",
  })
  const event = parseHookInput("userPromptSubmitted", raw)
  assert.equal(event.type, "user.prompt")
  assert.equal(event.type === "user.prompt" && event.prompt, "fix the bug")
})

test("parseHookInput — preToolUse: parses toolArgs and generates summary", () => {
  const toolArgs = JSON.stringify({ description: "List files in dir" })
  const raw = JSON.stringify({
    timestamp: 1700000003,
    cwd: "/tmp",
    toolName: "bash",
    toolArgs,
  })
  const event = parseHookInput("preToolUse", raw)
  assert.equal(event.type, "tool.pre")
  if (event.type === "tool.pre") {
    assert.deepEqual(event.parsedToolArgs, { description: "List files in dir" })
    assert.equal(event.summary, "bash: List files in dir")
  }
})

test("parseHookInput — postToolUse: extracts resultType and resultText", () => {
  const toolArgs = JSON.stringify({ path: "/src/index.ts" })
  const raw = JSON.stringify({
    timestamp: 1700000004,
    cwd: "/tmp",
    toolName: "read_file",
    toolArgs,
    toolResult: {
      resultType: "success",
      textResultForLlm: "file contents here",
    },
  })
  const event = parseHookInput("postToolUse", raw)
  assert.equal(event.type, "tool.post")
  if (event.type === "tool.post") {
    assert.equal(event.resultType, "success")
    assert.equal(event.resultText, "file contents here")
    assert.equal(event.summary, "read_file index.ts")
  }
})

test("parseHookInput — errorOccurred: extracts error fields", () => {
  const raw = JSON.stringify({
    timestamp: 1700000005,
    cwd: "/tmp",
    error: {
      message: "something broke",
      name: "TypeError",
      stack: "TypeError: something broke\n    at foo.ts:1",
    },
  })
  const event = parseHookInput("errorOccurred", raw)
  assert.equal(event.type, "error.occurred")
  if (event.type === "error.occurred") {
    assert.equal(event.error.message, "something broke")
    assert.equal(event.error.name, "TypeError")
    assert.equal(event.error.stack, "TypeError: something broke\n    at foo.ts:1")
  }
})

test("parseHookInput — missing required field throws with present keys", () => {
  const raw = JSON.stringify({ timestamp: 1, source: "new" }) // missing cwd
  assert.throws(() => parseHookInput("sessionStart", raw), {
    message: /must be a string \(present keys:/,
  })
})

test("parseHookInput — malformed JSON throws with hook name and preview", () => {
  assert.throws(() => parseHookInput("sessionStart", "not json at all"), {
    message: /sessionStart.*Received:/,
  })
})

// ---------------------------------------------------------------------------
// describeToolCall
// ---------------------------------------------------------------------------

test("describeToolCall — with description arg returns toolName: description", () => {
  assert.equal(describeToolCall("bash", { description: "Install deps" }), "bash: Install deps")
})

test("describeToolCall — with path arg returns toolName basename", () => {
  assert.equal(
    describeToolCall("read_file", { path: "/home/user/project/src/index.ts" }),
    "read_file index.ts",
  )
})

test("describeToolCall — with neither description nor path returns toolName", () => {
  assert.equal(describeToolCall("some_tool"), "some_tool")
  assert.equal(describeToolCall("other_tool", {}), "other_tool")
})

// ---------------------------------------------------------------------------
// summarizeText
// ---------------------------------------------------------------------------

test("summarizeText — short text returned as-is (normalized)", () => {
  assert.equal(summarizeText("hello world", 72), "hello world")
})

test("summarizeText — text exactly maxLength returned as-is", () => {
  const text = "a".repeat(20)
  assert.equal(summarizeText(text, 20), text)
})

test("summarizeText — text over maxLength truncated with ellipsis", () => {
  const text = "a".repeat(30)
  const result = summarizeText(text, 20)
  assert.equal(result.length, 20)
  assert.ok(result.endsWith("…"))
  assert.equal(result, `${"a".repeat(19)}…`)
})

test("summarizeText — whitespace normalized", () => {
  assert.equal(summarizeText("hello   world\n\tnew  line", 72), "hello world new line")
})

// ---------------------------------------------------------------------------
// summarizeTextWithFallback
// ---------------------------------------------------------------------------

test("summarizeTextWithFallback — undefined text returns fallback", () => {
  assert.equal(summarizeTextWithFallback(undefined, "n/a"), "n/a")
})

test("summarizeTextWithFallback — empty/whitespace text returns fallback", () => {
  assert.equal(summarizeTextWithFallback("", "fallback"), "fallback")
  assert.equal(summarizeTextWithFallback("   \n\t  ", "fallback"), "fallback")
})

test("summarizeTextWithFallback — valid text summarized normally", () => {
  assert.equal(summarizeTextWithFallback("hello world", "n/a"), "hello world")
  const long = "x".repeat(100)
  const result = summarizeTextWithFallback(long, "n/a", 30)
  assert.equal(result.length, 30)
  assert.ok(result.endsWith("…"))
})
