# copilot-cmux

`copilot-cmux` is a GitHub Copilot CLI plugin that pushes Copilot session activity into the current `cmux` workspace. It uses Copilot CLI hooks to translate session lifecycle, prompt activity, tool execution, and errors into cmux status pills, progress bars, sidebar logs, and notifications.

## What this plugin does

- Detects whether Copilot CLI is running inside a cmux-managed workspace and safely no-ops outside cmux.
- Uses automatic Unix socket transport when available, with CLI fallback.
- Tracks prompt submission, active tool execution, completion, and errors.
- Maintains lightweight per-workspace state so multiple hook invocations can render a coherent sidebar experience.
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
- `sessionEnd` clears active tool state and renders `done`, `idle`, or `error` based on the reason.
- `errorOccurred` renders an error state and sends an optional cmux notification.

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
