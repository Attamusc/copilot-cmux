# AGENTS.md

## Build

- Running bare `tsc` silently produces nothing — main `tsconfig.json` has `noEmit: true`.
  Always use `npm run build` (which runs `tsc -p tsconfig.build.json`).
- `exactOptionalPropertyTypes` is enabled. Do not assign `undefined` to optional
  properties — omit the key entirely or the build fails with a confusing type error.
- `hooks.json` entry points hardcode `./dist/hook-runner.js`. If build output
  structure changes, update `hooks.json` to match. Nothing enforces this automatically.
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

## State Persistence

- State is JSON-serialized to `/tmp/copilot-cmux/`. `JSON.stringify` strips
  `undefined` values, so they are lost on round-trip. New optional state fields
  must default to a concrete value or handle missing keys on read.
- The file lock uses `mkdir()` as an atomic operation with a 30-second stale
  threshold (`STALE_LOCK_THRESHOLD_MS` in `state-store.ts`). The lock recovery
  tests in `state-store.test.ts` hardcode timing relative to this value — keep
  them in sync.

## Tests

- Tests use real filesystem I/O and TCP sockets — no mocking framework. They
  can be sensitive to OS resource pressure or `/tmp` permissions.
- Run with `npm test`. Full check (lint + test): `npm run check`.
