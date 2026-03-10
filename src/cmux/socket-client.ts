import { connect } from "node:net"
import type {
  CmuxClient,
  HookLogger,
  NotificationPayload,
  ProgressPayload,
  SidebarLogPayload,
  SidebarStatusPayload,
} from "../types.js"
import {
  buildSocketClearProgress,
  buildSocketClearStatus,
  buildSocketLog,
  buildSocketNotify,
  buildSocketSetProgress,
  buildSocketSetStatus,
  parseCmuxResponse,
} from "./commands.js"

interface SocketRequestOptions {
  socketPath: string
  payload: string
  timeoutMs: number
}

interface SocketResult {
  response: string
  error?: never
}

interface SocketError {
  response?: never
  error: { code: string; message: string }
}

type SocketOutcome = SocketResult | SocketError

export function socketRequest(
  options: SocketRequestOptions,
): Promise<SocketOutcome> {
  return new Promise((resolve) => {
    let data = ""
    let settled = false

    const settle = (outcome: SocketOutcome) => {
      if (settled) return
      settled = true
      resolve(outcome)
    }

    let socket: ReturnType<typeof connect>
    try {
      socket = connect({ path: options.socketPath })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "UNKNOWN"
      settle({ error: { code, message } })
      return
    }

    socket.setTimeout(options.timeoutMs)

    socket.on("connect", () => {
      socket.write(options.payload)
    })

    socket.on("data", (chunk) => {
      data += chunk.toString()
      // cmux socket responds with "OK\n" or JSON and keeps connection open
      // Settle immediately when we receive any response
      socket.destroy()
      settle({ response: data })
    })

    socket.on("end", () => {
      settle({ response: data })
    })

    socket.on("close", () => {
      settle({ response: data })
    })

    socket.on("timeout", () => {
      socket.destroy()
      settle({
        error: {
          code: "ETIMEDOUT",
          message: `Socket request timed out after ${options.timeoutMs}ms`,
        },
      })
    })

    socket.on("error", (error) => {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "UNKNOWN"
      socket.destroy()
      settle({
        error: {
          code,
          message: error.message,
        },
      })
    })
  })
}

interface SocketCmuxClientOptions {
  socketPath: string
  workspaceID: string | undefined
  logger: HookLogger
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 5000

export class SocketCmuxClient implements CmuxClient {
  public readonly available = true
  public readonly transport = "socket" as const
  public readonly workspaceID: string | undefined

  private readonly socketPath: string
  private readonly logger: HookLogger
  private readonly timeoutMs: number
  private requestCounter = 0
  private reportedConnectionFailure = false

  public constructor(options: SocketCmuxClientOptions) {
    this.socketPath = options.socketPath
    this.workspaceID = options.workspaceID
    this.logger = options.logger
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  public async notify(payload: NotificationPayload): Promise<void> {
    const requestID = `req-${++this.requestCounter}`
    await this.sendJsonRpc(buildSocketNotify(payload, requestID), "notify")
  }

  public async setStatus(
    key: string,
    payload: SidebarStatusPayload,
  ): Promise<void> {
    await this.sendText(buildSocketSetStatus(key, payload, this.workspaceID), "set_status")
  }

  public async clearStatus(key: string): Promise<void> {
    await this.sendText(buildSocketClearStatus(key, this.workspaceID), "clear_status")
  }

  public async setProgress(payload: ProgressPayload): Promise<void> {
    await this.sendText(buildSocketSetProgress(payload, this.workspaceID), "set_progress")
  }

  public async clearProgress(): Promise<void> {
    await this.sendText(buildSocketClearProgress(this.workspaceID), "clear_progress")
  }

  public async log(payload: SidebarLogPayload): Promise<void> {
    await this.sendText(buildSocketLog(payload, this.workspaceID), "log")
  }

  private async sendJsonRpc(payload: string, label: string): Promise<void> {
    const outcome = await socketRequest({
      socketPath: this.socketPath,
      payload,
      timeoutMs: this.timeoutMs,
    })

    if (outcome.error) {
      await this.handleError(outcome.error, label)
      return
    }

    const parsed = parseCmuxResponse(outcome.response)
    if (parsed && !parsed.ok) {
      await this.logger.log("warn", `cmux ${label} returned an error`, {
        error: parsed.error,
      })
    }
  }

  private async sendText(payload: string, label: string): Promise<void> {
    const outcome = await socketRequest({
      socketPath: this.socketPath,
      payload,
      timeoutMs: this.timeoutMs,
    })

    if (outcome.error) {
      await this.handleError(outcome.error, label)
    }
  }

  private async handleError(
    error: { code: string; message: string },
    label: string,
  ): Promise<void> {
    if (error.code === "ECONNREFUSED" || error.code === "ENOENT") {
      if (this.reportedConnectionFailure) return
      this.reportedConnectionFailure = true
    }

    await this.logger.log("error", `cmux socket ${label} failed`, {
      code: error.code,
      error: error.message,
    })
  }
}
