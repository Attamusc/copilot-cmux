import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import type { RuntimeState } from "../types.js"

interface StatePaths {
  rootDir: string
  statePath: string
  lockPath: string
}

function buildStateKey(cwd: string, workspaceID?: string): string {
  return createHash("sha1").update(`${cwd}\u0000${workspaceID ?? ""}`).digest("hex")
}

function getStatePaths(cwd: string, workspaceID?: string): StatePaths {
  const rootDir = join(tmpdir(), "copilot-cmux")
  const key = buildStateKey(cwd, workspaceID)
  return {
    rootDir,
    statePath: join(rootDir, `${key}.json`),
    lockPath: join(rootDir, `${key}.lock`),
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function acquireLock(lockPath: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await mkdir(lockPath)
      return
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : undefined
      if (code !== "EEXIST") {
        throw error
      }
      await sleep(25)
    }
  }

  throw new Error(`Timed out waiting for state lock: ${lockPath}`)
}

async function readState(statePath: string): Promise<RuntimeState | null> {
  try {
    const raw = await readFile(statePath, "utf8")
    return JSON.parse(raw) as RuntimeState
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined
    if (code === "ENOENT") {
      return null
    }
    throw error
  }
}

async function writeState(statePath: string, state: RuntimeState): Promise<void> {
  const tempPath = `${statePath}.tmp`
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
  await rename(tempPath, statePath)
}

export async function withRuntimeState(
  cwd: string,
  workspaceID: string | undefined,
  update: (state: RuntimeState | null) => Promise<RuntimeState | null>,
): Promise<void> {
  const paths = getStatePaths(cwd, workspaceID)
  await mkdir(paths.rootDir, { recursive: true })
  await acquireLock(paths.lockPath)

  try {
    const currentState = await readState(paths.statePath)
    const nextState = await update(currentState)

    if (nextState) {
      await writeState(paths.statePath, nextState)
    } else {
      await rm(paths.statePath, { force: true })
    }
  } finally {
    await rm(paths.lockPath, { recursive: true, force: true })
  }
}
