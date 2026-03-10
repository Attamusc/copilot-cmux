export type TransportMode = "cli" | "socket" | "auto"
export type LogLevel = "debug" | "info" | "warn" | "error"
export type SidebarLogLevel = "info" | "progress" | "success" | "warning" | "error"
export type RuntimePhase = "idle" | "thinking" | "working" | "done" | "error"
export type HookName =
  | "sessionStart"
  | "sessionEnd"
  | "userPromptSubmitted"
  | "preToolUse"
  | "postToolUse"
  | "errorOccurred"
export type SessionStartSource = "new" | "resume" | "startup"
export type SessionEndReason = "complete" | "error" | "abort" | "timeout" | "user_exit"
export type ToolResultType = "success" | "failure" | "denied"

export interface PluginConfig {
  cmuxBin: string
  statusKey: string
  transport: TransportMode
  progressEnabled: boolean
  keepDoneStatus: boolean
  logPrompts: boolean
  logToolCalls: boolean
  logSessionLifecycle: boolean
  notifyOnSessionEnd: boolean
  notifyOnErrors: boolean
  debug: boolean
}

export interface SidebarStatusPayload {
  text: string
  icon: string
  color: string
}

export interface ProgressPayload {
  value: number
  label: string
}

export interface NotificationPayload {
  title: string
  subtitle?: string
  body?: string
}

export interface SidebarLogPayload {
  level: SidebarLogLevel
  source: string
  message: string
}

export interface PresentationSnapshot {
  status?: SidebarStatusPayload
  progress?: ProgressPayload
}

export interface CmuxClient {
  readonly available: boolean
  readonly transport: "cli" | "socket"
  readonly workspaceID: string | undefined
  notify(payload: NotificationPayload): Promise<void>
  setStatus(key: string, payload: SidebarStatusPayload): Promise<void>
  clearStatus(key: string): Promise<void>
  setProgress(payload: ProgressPayload): Promise<void>
  clearProgress(): Promise<void>
  log(payload: SidebarLogPayload): Promise<void>
}

export interface HookLogger {
  log(level: LogLevel, message: string, extra?: Record<string, unknown>): Promise<void>
}

export interface CmuxEnvironment {
  workspaceID: string | undefined
  surfaceID: string | undefined
  socketPath: string
  isManagedWorkspace: boolean
  hasSocket: boolean
  termProgram: string | undefined
}

export interface RuntimeState {
  version: 1
  cwd: string
  workspaceID: string | undefined
  updatedAt: number
  startedAt: number | undefined
  source: SessionStartSource | undefined
  phase: RuntimePhase
  lastPrompt: string | undefined
  activeTools: Record<string, number>
  toolInvocations: number
  completedTools: number
  lastToolName: string | undefined
  lastToolSummary: string | undefined
  lastResultType: ToolResultType | undefined
  lastError:
    | {
      message: string
      name: string | undefined
    }
    | undefined
  lastSessionEndReason: SessionEndReason | undefined
}

export interface SessionStartHookInput {
  timestamp: number
  cwd: string
  source: SessionStartSource
  initialPrompt: string | undefined
}

export interface SessionEndHookInput {
  timestamp: number
  cwd: string
  reason: SessionEndReason
}

export interface UserPromptSubmittedHookInput {
  timestamp: number
  cwd: string
  prompt: string
}

export interface PreToolUseHookInput {
  timestamp: number
  cwd: string
  toolName: string
  toolArgs: string
}

export interface ToolResult {
  resultType: ToolResultType
  textResultForLlm: string | undefined
}

export interface PostToolUseHookInput {
  timestamp: number
  cwd: string
  toolName: string
  toolArgs: string
  toolResult?: ToolResult
}

export interface ErrorOccurredHookInput {
  timestamp: number
  cwd: string
  error: {
    message: string
    name: string | undefined
    stack: string | undefined
  }
}
