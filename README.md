# copilot-cmux

`copilot-cmux` is a GitHub Copilot CLI plugin that pushes Copilot session activity into the current `cmux` workspace. It uses Copilot CLI hooks to translate session lifecycle, prompt activity, tool execution, and errors into cmux status pills, progress bars, sidebar logs, and notifications.

## What this plugin does

- Detects whether Copilot CLI is running inside a cmux-managed workspace and safely no-ops outside cmux.
- Uses automatic Unix socket transport when available, with CLI fallback.
- Tracks prompt submission, active tool execution, completion, and errors.
- Maintains lightweight per-surface (per-tab) state so multiple hook invocations can render a coherent sidebar experience.
- Surfaces `thinking`, `working`, `done`, and `error` states in cmux.

## Current scope

This plugin is an MVP tailored to the GitHub Copilot CLI hook surface that is currently documented.

Supported well:
- Session start/end
- User prompt submission
- Pre/post tool execution
- Error reporting

Not yet modeled in this MVP:
- Subagent lifecycle
- Question / permission overlays
- Todo progress

## Requirements

- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)
- [`cmux`](https://www.cmux.dev/) installed and available on `PATH`
- A cmux-managed workspace so `CMUX_WORKSPACE_ID` is present
- Node.js 20+

## Installation

Build the plugin first:

```bash
npm install
npm run build
```

Then install the plugin into Copilot CLI from this repository root:

```bash
copilot plugin install ./
```

Verify it loaded:

```bash
copilot plugin list
```

Or use the Makefile shortcuts:

```bash
make setup
make plugin-list
```

## Behavior

- `sessionStart` initializes or resets workspace state.
- `userPromptSubmitted` marks the session as `thinking` and optionally logs the submitted prompt.
- `preToolUse` marks the workspace as `working`, increments active tool tracking, and logs the tool.
- `postToolUse` decrements active tool tracking, logs success/failure/denial, and returns to `thinking` when the agent is between tools.
- `agentStop` ends the turn: active tool state is cleared and the workspace renders `done`. This is what marks a response as finished — `sessionEnd` only fires when the CLI process itself exits, which in an interactive session means when you quit.
- `sessionEnd` clears active tool state and renders `done`, `idle`, or `error` based on the reason.
- `errorOccurred` renders an error state and sends an optional cmux notification.

Hooks fired by background sessions — the built-in sidekick agents (`sidekick-*`)
and Task/subagent tool calls (`toolu_*`) — are ignored. They report the primary
session's `cwd`, so without filtering they would reset the pill mid-turn and
fire spurious "done" notifications.

## Multiple tabs in one workspace

A cmux workspace can contain several surfaces (tabs), each running its own Copilot session,
usually sharing a `cwd`. cmux status entries are workspace-scoped and identified by key, and
the progress bar is a single per-workspace resource with no key at all. The plugin handles
this as follows:

- **State** is keyed per surface (`CMUX_SURFACE_ID`), so tabs never share or corrupt each
  other's active-tool tracking.
- **Status pills** use a per-surface key (`copilot.<surfaceID>`), so each tab gets its own
  pill instead of overwriting its neighbours'.
- **Progress** is aggregated across all tabs in the workspace. Every tab computes the same
  value from the shared state files, so the bar is stable no matter which tab writes last,
  and it is only cleared once no tab is active. With more than one tab busy the label reads
  `<project>: N tabs active`.
- The pill is **cleared on session end** so quitting Copilot doesn't orphan a `done` entry.
- **Orphaned pills are reaped.** Closing a tab kills its Copilot session without firing
  `sessionEnd`, so its last pill would otherwise stay in the sidebar forever. On session
  start and at the end of each turn, pills belonging to surfaces that no longer exist are
  cleared. Only `<statusKey>.<surfaceID>` entries are touched — an unkeyed `copilot` entry
  belongs to cmux itself and is left alone. This needs the socket transport, since the CLI
  has no way to enumerate live surfaces.

## Configuration

Environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `COPILOT_CMUX_BIN` | `cmux` | Override the `cmux` executable path. |
| `COPILOT_CMUX_STATUS_KEY` | `copilot` | Sidebar status key namespace. |
| `COPILOT_CMUX_TRANSPORT` | `auto` | `auto`, `socket`, or `cli`. |
| `COPILOT_CMUX_PROGRESS` | `true` | Show progress while Copilot is thinking or working. |
| `COPILOT_CMUX_KEEP_DONE_STATUS` | `true` | Keep the final `done` pill visible after completion. |
| `COPILOT_CMUX_LOG_PROMPTS` | `true` | Log prompt submissions to the cmux sidebar. |
| `COPILOT_CMUX_LOG_TOOLS` | `true` | Log tool start and completion events. |
| `COPILOT_CMUX_LOG_SESSION_LIFECYCLE` | `true` | Log session start/end transitions. |
| `COPILOT_CMUX_NOTIFY_SESSION_END` | `true` | Notify when Copilot completes a session successfully. |
| `COPILOT_CMUX_NOTIFY_TURN_END` | `false` | Notify when Copilot finishes responding to a prompt. Off by default because it fires on every turn. |
| `COPILOT_CMUX_NOTIFY_ERRORS` | `true` | Notify when Copilot reports an error. |
| `COPILOT_CMUX_LOG_FILE_EDITS` | `true` | Log file edit/create events to the cmux sidebar. |
| `COPILOT_CMUX_DEBUG` | `false` | Emit verbose diagnostics to stderr. |

## Development

```bash
npm test
```

When you make local changes, rebuild and reinstall from the repository root so Copilot CLI refreshes the cached plugin copy:

```bash
npm run build
copilot plugin install ./
```

Useful helper targets:

```bash
make help
make build
make test
```

## Notes

The implementation is built around Copilot CLI's documented hook model, with a portable cmux transport layer and runtime state/presenter logic tailored to the available hook events.
