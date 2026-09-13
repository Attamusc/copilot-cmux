/**
 * Session-id patterns that are never the primary interactive session.
 *
 * Verified against Copilot CLI 1.0.79:
 *   - `sidekick-<name>-<timestamp>` — built-in background agents (e.g. the
 *     context/memory sidekick).
 *   - `toolu_<id>` — Task/subagent tool call ids.
 *
 * Primary sessions use a UUID.
 */
const NON_PRIMARY_PREFIXES = ["sidekick-", "toolu_"]

/**
 * Copilot CLI fires lifecycle hooks for sessions that are NOT the primary
 * interactive session sharing the cmux surface.
 *
 * Those sessions report the primary session's `cwd`, so without filtering they
 * corrupt the surface's state: a sidekick `sessionStart` resets the pill to
 * idle while the real agent is mid-turn, and its `sessionEnd` renders "done"
 * and fires a desktop notification.
 *
 * This deliberately fails *open*: anything that is not a known background
 * pattern is treated as primary. Matching on the primary shape instead (e.g.
 * requiring a UUID) would silently disable the whole plugin if a future CLI
 * release changed its id format.
 */
export function isPrimarySessionID(sessionID: string | undefined): boolean {
  if (!sessionID) return true
  return !NON_PRIMARY_PREFIXES.some((prefix) => sessionID.startsWith(prefix))
}
