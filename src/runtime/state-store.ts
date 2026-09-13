import { createHash } from "node:crypto"
import { statSync } from "node:fs"
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { RuntimeState } from "../types.js"

interface StatePaths {
  rootDir: string
  workspaceDir: string
  statePath: string
  lockPath: string
}

function hashKey(...parts: (string | undefined)[]): string {
  return createHash("sha1")
    .update(parts.map((p) => p ?? "").join("\u0000"))
    .digest("hex")
}

function getRootDir(): string {
  return join(tmpdir(), "copilot-cmux")
}

/**
 * State is keyed per *surface* (cmux tab), not per workspace.
 *
 * A cmux workspace can hold several surfaces, each running its own Copilot
 * session, and they usually share a `cwd`. Keying state on `cwd + workspaceID`
 * alone made every tab in a workspace read and write the same file, so their
 * `activeTools` counters interleaved and one tab's `agentStop` wiped another
 * tab's in-flight state.
 *
 * Files are grouped in a per-workspace directory so sibling surfaces can be
 * enumerated cheaply for workspace-level aggregation (the cmux progress bar is
 * a single per-workspace resource).
 */
function getStatePaths(cwd: string, workspaceID?: string, surfaceID?: string): StatePaths {
  const rootDir = getRootDir()
  const workspaceDir = join(rootDir, hashKey(workspaceID))
  const key = hashKey(cwd, workspaceID, surfaceID)
  return {
    rootDir,
    workspaceDir,
    statePath: join(workspaceDir, `${key}.json`),
    lockPath: join(workspaceDir, `${key}.lock`),
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

const STALE_LOCK_THRESHOLD_MS = 30_000

async function acquireLock(lockPath: string): Promise<void> {
  // Clean up stale locks from crashed processes
  try {
    const stat = statSync(lockPath)
    if (Date.now() - stat.mtimeMs > STALE_LOCK_THRESHOLD_MS) {
      await rm(lockPath, { recursive: true, force: true })
    }
  } catch {
    // Lock doesn't exist — normal case
  }

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

export async function cleanupStaleStateFiles(maxAgeMs: number = 3_600_000): Promise<void> {
  const root = getRootDir()
  const now = Date.now()

  const pruneDir = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        const full = join(dir, entry.name)
        try {
          if (entry.isDirectory() && !entry.name.endsWith(".lock")) {
            await pruneDir(full)
            return
          }
          if (!entry.name.endsWith(".json")) return
          const raw = await readFile(full, "utf8")
          const state = JSON.parse(raw) as { updatedAt?: number }
          if (typeof state.updatedAt === "number" && now - state.updatedAt > maxAgeMs) {
            await rm(full, { force: true })
          }
        } catch {
          // Ignore per-entry errors (locked, deleted, malformed, etc.)
        }
      }),
    )
  }

  try {
    await pruneDir(root)
  } catch {
    // Directory doesn't exist or is unreadable — nothing to clean up
  }
}

/**
 * Read the state of every *other* surface in the same cmux workspace.
 *
 * Used to aggregate workspace-level UI (the progress bar has no key, so it is
 * shared by all tabs). Reading is best-effort and lock-free: a torn read just
 * means one frame of slightly stale aggregation.
 */
export async function readSiblingStates(
  cwd: string,
  workspaceID: string | undefined,
  surfaceID: string | undefined,
  maxAgeMs: number = 3_600_000,
): Promise<RuntimeState[]> {
  const { workspaceDir, statePath } = getStatePaths(cwd, workspaceID, surfaceID)
  const now = Date.now()

  try {
    const entries = await readdir(workspaceDir)
    const states = await Promise.all(
      entries
        .filter((name) => name.endsWith(".json"))
        .map((name) => join(workspaceDir, name))
        .filter((path) => path !== statePath)
        .map(async (path) => {
          try {
            return JSON.parse(await readFile(path, "utf8")) as RuntimeState
          } catch {
            return null
          }
        }),
    )
    return states.filter(
      (state): state is RuntimeState =>
        state !== null && typeof state.updatedAt === "number" && now - state.updatedAt <= maxAgeMs,
    )
  } catch {
    return []
  }
}

export async function withRuntimeState(
  cwd: string,
  workspaceID: string | undefined,
  surfaceID: string | undefined,
  update: (state: RuntimeState | null) => Promise<RuntimeState | null>,
): Promise<void> {
  const paths = getStatePaths(cwd, workspaceID, surfaceID)
  await mkdir(paths.workspaceDir, { recursive: true })
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
