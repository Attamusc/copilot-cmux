#!/usr/bin/env node
import { processHook } from "./runtime/processor.js"
import type { HookName } from "./types.js"

const HOOK_NAMES = new Set<HookName>([
  "sessionStart",
  "sessionEnd",
  "userPromptSubmitted",
  "preToolUse",
  "postToolUse",
  "agentStop",
  "errorOccurred",
])

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = []
  for await (const chunk of process.stdin) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk))
    } else {
      chunks.push(chunk)
    }
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function main(): Promise<void> {
  const hookName = process.argv[2]
  if (!hookName || !HOOK_NAMES.has(hookName as HookName)) {
    throw new Error(`Expected a Copilot hook name argument (${Array.from(HOOK_NAMES).join(", ")})`)
  }

  const rawInput = await readStdin()
  await processHook(hookName as HookName, rawInput)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`[copilot-cmux] error: ${message}\n`)
  // Always exit 0. A non-zero exit from a preToolUse hook is interpreted by
  // Copilot CLI as "deny this tool call", so a cosmetic status-bar plugin
  // failing must never be able to block the agent.
  process.exitCode = 0
})
