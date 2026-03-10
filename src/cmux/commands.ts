import type {
  NotificationPayload,
  ProgressPayload,
  SidebarLogPayload,
  SidebarStatusPayload,
} from "../types.js"

function withWorkspace(args: string[], workspaceID?: string): string[] {
  return workspaceID ? [...args, "--workspace", workspaceID] : args
}

function quoteSocketArg(value: string): string {
  // If the value contains spaces, newlines, or quotes, wrap in double quotes and escape
  if (/[\s"\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  }
  return value
}

export function buildNotifyCommand(payload: NotificationPayload, workspaceID?: string): string[] {
  const args = ["notify", "--title", payload.title]
  if (payload.subtitle) args.push("--subtitle", payload.subtitle)
  if (payload.body) args.push("--body", payload.body)
  return withWorkspace(args, workspaceID)
}

export function buildSetStatusCommand(
  key: string,
  payload: SidebarStatusPayload,
  workspaceID?: string,
): string[] {
  const args = ["set-status", key, payload.text, "--icon", payload.icon, "--color", payload.color]
  return withWorkspace(args, workspaceID)
}

export function buildClearStatusCommand(key: string, workspaceID?: string): string[] {
  return withWorkspace(["clear-status", key], workspaceID)
}

export function buildSetProgressCommand(payload: ProgressPayload, workspaceID?: string): string[] {
  return withWorkspace(
    ["set-progress", payload.value.toFixed(2), "--label", payload.label],
    workspaceID,
  )
}

export function buildClearProgressCommand(workspaceID?: string): string[] {
  return withWorkspace(["clear-progress"], workspaceID)
}

export function buildLogCommand(payload: SidebarLogPayload, workspaceID?: string): string[] {
  const args = ["log", "--level", payload.level, "--source", payload.source]
  return withWorkspace([...args, "--", payload.message], workspaceID)
}

function withTab(command: string, workspaceID?: string): string {
  const base = workspaceID ? `${command} --tab=${workspaceID}` : command
  return `${base}\n`
}

export function buildSocketSetStatus(
  key: string,
  payload: SidebarStatusPayload,
  workspaceID?: string,
): string {
  const quotedText = quoteSocketArg(payload.text)
  const command = `set_status ${key} ${quotedText} --icon=${payload.icon} --color=${payload.color}`
  return withTab(command, workspaceID)
}

export function buildSocketClearStatus(key: string, workspaceID?: string): string {
  return withTab(`clear_status ${key}`, workspaceID)
}

export function buildSocketSetProgress(payload: ProgressPayload, workspaceID?: string): string {
  const quotedLabel = quoteSocketArg(payload.label)
  const command = `set_progress ${payload.value.toFixed(2)} --label=${quotedLabel}`
  return withTab(command, workspaceID)
}

export function buildSocketClearProgress(workspaceID?: string): string {
  return withTab("clear_progress", workspaceID)
}

export function buildSocketLog(payload: SidebarLogPayload, workspaceID?: string): string {
  const quotedSource = quoteSocketArg(payload.source)
  const quotedMessage = quoteSocketArg(payload.message)
  let command = `log --level=${payload.level} --source=${quotedSource}`
  if (workspaceID) command += ` --tab=${workspaceID}`
  command += ` -- ${quotedMessage}`
  return `${command}\n`
}

export function buildJsonRpc(
  method: string,
  params: Record<string, unknown>,
  requestID: string,
): string {
  const cleanParams: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      cleanParams[key] = value
    }
  }
  return `${JSON.stringify({ id: requestID, method, params: cleanParams })}\n`
}

export function buildSocketNotify(
  payload: NotificationPayload,
  requestID: string,
  workspaceID?: string,
): string {
  return buildJsonRpc(
    "notification.create",
    {
      title: payload.title,
      subtitle: payload.subtitle,
      body: payload.body,
      workspace_id: workspaceID,
    },
    requestID,
  )
}

export interface CmuxResponse {
  id: string
  ok: boolean
  result?: unknown
  error?: string
}

export function parseCmuxResponse(raw: string): CmuxResponse | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed[0] !== "{") {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === "object" && parsed !== null && "ok" in parsed) {
      return parsed as CmuxResponse
    }
  } catch {
    return null
  }

  return null
}
