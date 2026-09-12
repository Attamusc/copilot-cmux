import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))

interface HookEntry {
  type: string
  bash: string
  powershell: string
  cwd?: string
  timeoutSec?: number
}

interface HooksManifest {
  version: number
  hooks: Record<string, HookEntry[]>
}

function readManifest(): HooksManifest {
  return JSON.parse(readFileSync(join(repoRoot, "hooks.json"), "utf8")) as HooksManifest
}

test("hooks resolve the runner via COPILOT_PLUGIN_ROOT, not the session cwd", () => {
  const manifest = readManifest()
  const entries = Object.values(manifest.hooks).flat()
  assert.ok(entries.length > 0)

  for (const entry of entries) {
    // A relative path would be resolved against the session's working directory,
    // which is where the user is running Copilot, not where the plugin lives.
    assert.equal(entry.cwd, undefined)
    assert.match(entry.bash, /\$COPILOT_PLUGIN_ROOT\/dist\/hook-runner\.js/)
    assert.match(entry.powershell, /\$env:COPILOT_PLUGIN_ROOT\/dist\/hook-runner\.js/)
    assert.doesNotMatch(entry.bash, /node \.\//)
  }
})

test("hook commands can never exit non-zero", () => {
  const manifest = readManifest()

  // A non-zero exit from preToolUse is read by Copilot CLI as "deny this tool
  // call". These guards cover node failing to start at all; hook-runner.ts
  // covers failures once it is running.
  for (const entry of Object.values(manifest.hooks).flat()) {
    assert.match(entry.bash, /\|\| true$/)
    assert.match(entry.powershell, /; exit 0$/)
  }
})

test("every hook the runner accepts is registered in hooks.json", async () => {
  const manifest = readManifest()
  const source = readFileSync(join(repoRoot, "src/hook-runner.ts"), "utf8")

  for (const hookName of Object.keys(manifest.hooks)) {
    assert.ok(source.includes(`"${hookName}"`), `hook-runner.ts does not handle ${hookName}`)
    // Each entry must invoke the runner with its own hook name.
    for (const entry of manifest.hooks[hookName] ?? []) {
      assert.match(entry.bash, new RegExp(`hook-runner\\.js" ${hookName}\\b`))
    }
  }
})
