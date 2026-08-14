/**
 * cmux status entries outlive the process that created them. Closing a tab
 * terminates its Copilot session without any `sessionEnd` hook, so the pill
 * that session last wrote stays in the workspace sidebar forever — a row of
 * stale "done" entries, or worse a permanent "thinking" one for a tab that was
 * closed mid-turn.
 *
 * Nothing notifies us when a surface disappears, so orphans are reclaimed
 * opportunistically: on session start and at the end of a turn, any pill
 * belonging to a surface that no longer exists is cleared.
 */

/**
 * Returns the status keys owned by this plugin whose surface is gone.
 *
 * Only keys of the form `<statusKey>.<surfaceID>` are considered. The bare
 * `<statusKey>` entry is deliberately left alone: cmux and other integrations
 * publish an unkeyed `copilot` status of their own, and reaping it would delete
 * a pill this plugin does not own.
 */
export function findOrphanedStatusKeys(
  statusKey: string,
  existingKeys: readonly string[],
  liveSurfaceIDs: readonly string[],
): string[] {
  // An empty live set means the lookup failed (unsupported transport, socket
  // error, older cmux). Reaping against it would clear every pill in the
  // workspace, so treat "we don't know" as "reap nothing".
  if (liveSurfaceIDs.length === 0) return []

  const live = new Set(liveSurfaceIDs)
  const prefix = `${statusKey}.`

  return existingKeys.filter((key) => {
    if (!key.startsWith(prefix)) return false
    const surfaceID = key.slice(prefix.length)
    if (!surfaceID) return false
    return !live.has(surfaceID)
  })
}
