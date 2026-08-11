# AGENTS.md

## Build

- Running bare `tsc` silently produces nothing — main `tsconfig.json` has `noEmit: true`.
  Always use `npm run build` (which runs `tsc -p tsconfig.build.json`).
- `exactOptionalPropertyTypes` is enabled. Do not assign `undefined` to optional
  properties — omit the key entirely or the build fails with a confusing type error.
- `hooks.json` entry points resolve the runner via `$COPILOT_PLUGIN_ROOT`, the plugin
  install directory that Copilot CLI exports into the hook subprocess. Do not use a
  relative path or `"cwd": "."` — the CLI resolves those against the *session's* working
  directory, not the plugin directory, so the runner is only found when the user happens
  to be sitting in the plugin repo. If build output structure changes, update
  `hooks.json` to match. Nothing enforces this automatically.
- Hook commands must always exit 0. Copilot CLI treats a non-zero exit from
  `preToolUse` as "deny this tool call", so a failing status-bar hook would block
  every tool call in the session. This is enforced in two places: `hook-runner.ts`
  sets `process.exitCode = 0` in its top-level catch, and `hooks.json` appends
  `|| true` (bash) / `; exit 0` (powershell) to cover node itself failing to start.
- Keep versions in `plugin.json` and `package.json` in sync manually.

## Dependencies

- Zero production dependencies is intentional. Hooks run under a 10-second timeout
  imposed by the Copilot CLI host. Adding npm packages risks startup latency and
  install complexity. Use only Node.js built-ins.

## Module Boundaries

- `cmux/` never imports from `runtime/`. `runtime/` may import from `cmux/` and
  shared modules (`types.ts`, `config.ts`). No tooling enforces this — do not
  introduce circular dependencies between these layers.

## Intentional Design Decisions

These patterns look wrong but are deliberate. Do not "fix" them:

- **Fire-and-forget cleanup**: `cleanupStaleStateFiles()` in `processor.ts` is
  called with `void` and swallows all errors. Cleanup must never block or fail
  a hook within its 10-second window.
- **Socket client does not reconnect**: After the first connection failure,
  `SocketCmuxClient` stops trying for the rest of the session. Retries would
  burn the 10-second hook budget. The CLI fallback handles this gracefully.
- **CLI and socket command builders are intentionally separate**: CLI commands
  pass args as an array to `execFile` (OS handles escaping). Socket commands
  build a JSON-RPC string with manual quoting via `quoteSocketArg()`. Do not
  unify these — they have different escaping requirements.

## Multi-Tab / Surface Scoping

A cmux workspace holds multiple surfaces (tabs), which typically share a `cwd`.
The two cmux resources behave differently and must be handled differently:

- **Status entries** are workspace-scoped but keyed, so each surface gets its own
  key (`copilot.<surfaceID>`). Do not go back to a single shared key — the last
  hook to fire would overwrite every other tab's pill.
- **The progress bar is a single unkeyed per-workspace resource.** It genuinely
  cannot be per-tab. It is therefore *aggregated*: every surface computes the
  same value from its own state plus its siblings' state files, so the result is
  independent of which tab wrote last. Do not make progress depend only on the
  current surface's state — it will fight with the other tabs.
- Passing a surface id as `--tab=` to the socket API appears to succeed
  (returns `OK`) but the entry is then unaddressable ("Tab not found" from
  `list_status`). Surface-scoped status is not actually supported; scope by key.

## State Persistence

- State is JSON-serialized to `/tmp/copilot-cmux/`, grouped per workspace with
  one file per surface. Reads of sibling surfaces are best-effort: a malformed
  or partially written sibling file must never fail the current hook.
- Tests that write state must use workspace ids unique per run. The per-workspace
  directory is shared across runs, so a fixed id leaks state between them and
  makes sibling assertions flaky.
- `JSON.stringify` strips `undefined` values, so they are lost on round-trip. New optional state fields
  must default to a concrete value or handle missing keys on read.
- The file lock uses `mkdir()` as an atomic operation with a 30-second stale
  threshold (`STALE_LOCK_THRESHOLD_MS` in `state-store.ts`). The lock recovery
  tests in `state-store.test.ts` hardcode timing relative to this value — keep
  them in sync.

## Tests

- Tests use real filesystem I/O and TCP sockets — no mocking framework. They
  can be sensitive to OS resource pressure or `/tmp` permissions.
- Run with `npm test`. Full check (lint + test): `npm run check`.
