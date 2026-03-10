import { basename } from "node:path"
import { createCmuxClient } from "../cmux/client.js"
import { detectCmuxEnvironment } from "../cmux/detect.js"
import { loadConfig } from "../config.js"
import { createLogger } from "../logger.js"
import { summarizeText } from "../text.js"
import type {
  CmuxClient,
  HookLogger,
  HookName,
  PluginConfig,
  RuntimeState,
  SidebarLogLevel,
} from "../types.js"
import { type CopilotHookEvent, parseHookInput } from "./events.js"
import { createRuntimeState, reduceRuntimeState } from "./reducer.js"
import { buildPresentationSnapshot } from "./renderer.js"
import { cleanupStaleStateFiles, withRuntimeState } from "./state-store.js"

function isFileEditTool(toolName: string): boolean {
  return toolName === "edit" || toolName === "create"
}

function projectLabelForCwd(cwd: string): string {
  return basename(cwd) || cwd
}

async function renderState(
  cmux: CmuxClient,
  config: PluginConfig,
  state: RuntimeState,
  projectLabel: string,
  logger: HookLogger,
): Promise<void> {
  const snapshot = buildPresentationSnapshot(state, config, projectLabel)

  await logger.log("debug", "renderState", {
    phase: state.phase,
    activeTools: state.activeTools,
    snapshotStatus: snapshot.status?.text,
    hasProgress: !!snapshot.progress,
  })

  if (snapshot.status) {
    await logger.log("debug", "setting status", { status: snapshot.status })
    await cmux.setStatus(config.statusKey, snapshot.status)
  } else {
    await logger.log("debug", "clearing status")
    await cmux.clearStatus(config.statusKey)
  }

  if (snapshot.progress) {
    await cmux.setProgress(snapshot.progress)
  } else {
    await cmux.clearProgress()
  }
}

async function logEvent(cmux: CmuxClient, level: SidebarLogLevel, message: string): Promise<void> {
  await cmux.log({
    level,
    source: "copilot",
    message,
  })
}

async function emitEventEffects(
  cmux: CmuxClient,
  config: PluginConfig,
  projectLabel: string,
  previousState: RuntimeState,
  nextState: RuntimeState,
  event: CopilotHookEvent,
  logger: HookLogger,
): Promise<void> {
  await logger.log("debug", "emitEventEffects", {
    eventType: event.type,
    previousPhase: previousState.phase,
    nextPhase: nextState.phase,
  })
  switch (event.type) {
    case "session.start": {
      if (config.logSessionLifecycle) {
        await logEvent(cmux, "info", `${projectLabel}: Copilot session started (${event.source})`)
      }
      break
    }

    case "user.prompt": {
      if (config.logPrompts) {
        await logEvent(cmux, "info", `${projectLabel}: prompt - ${summarizeText(event.prompt, 88)}`)
      }
      break
    }

    case "tool.pre": {
      if (config.logToolCalls) {
        await logEvent(cmux, "progress", `${projectLabel}: running ${event.summary}`)
      }
      break
    }

    case "tool.post": {
      if (config.logToolCalls) {
        const level: SidebarLogLevel =
          event.resultType === "failure"
            ? "error"
            : event.resultType === "denied"
              ? "warning"
              : "info"
        const verb =
          event.resultType === "failure"
            ? "failed"
            : event.resultType === "denied"
              ? "denied"
              : "finished"
        const suffix = event.resultText ? ` - ${summarizeText(event.resultText, 72)}` : ""
        await logEvent(cmux, level, `${projectLabel}: ${verb} ${event.summary}${suffix}`)
      }
      if (config.logFileEdits && isFileEditTool(event.toolName) && event.resultType === "success") {
        const filePath =
          typeof event.parsedToolArgs?.path === "string"
            ? basename(event.parsedToolArgs.path)
            : event.toolName
        await logEvent(cmux, "info", `${projectLabel}: ${event.toolName} ${filePath}`)
      }
      break
    }

    case "error.occurred": {
      await logEvent(
        cmux,
        "error",
        `${projectLabel}: error - ${summarizeText(event.error.message, 96)}`,
      )
      if (config.notifyOnErrors) {
        await cmux.notify({
          title: `Error: ${projectLabel}`,
          body: summarizeText(event.error.message, 120),
        })
      }
      break
    }

    case "session.end": {
      if (event.reason === "complete") {
        if (config.logSessionLifecycle) {
          await logEvent(cmux, "success", `${projectLabel}: done`)
        }
        if (config.notifyOnSessionEnd) {
          await cmux.notify({
            title: `Done: ${projectLabel}`,
            body: "Copilot session complete",
          })
        }
        break
      }

      if (event.reason === "error") {
        if (previousState.phase !== "error") {
          await logEvent(cmux, "error", `${projectLabel}: session ended with an error`)
        }
        if (config.notifyOnErrors && previousState.phase !== "error") {
          await cmux.notify({
            title: `Error: ${projectLabel}`,
            body: "Copilot session ended with an error",
          })
        }
        break
      }

      if (config.logSessionLifecycle) {
        const level: SidebarLogLevel = event.reason === "timeout" ? "warning" : "info"
        await logEvent(cmux, level, `${projectLabel}: session ended (${event.reason})`)
      }
      break
    }
  }

  await renderState(cmux, config, nextState, projectLabel, logger)
}

export async function processHook(
  hookName: HookName,
  rawInput: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = loadConfig(env)
  const logger = createLogger(config.debug)

  await logger.log("debug", "processHook starting", { hookName })

  const event = parseHookInput(hookName, rawInput)
  const environment = detectCmuxEnvironment(env)

  await logger.log("debug", "environment detected", {
    isManagedWorkspace: environment.isManagedWorkspace,
    workspaceID: environment.workspaceID,
    hasSocket: environment.hasSocket,
  })

  if (!environment.isManagedWorkspace) {
    await logger.log("debug", "cmux not detected, hook no-op", {
      hookName,
      cwd: event.cwd,
    })
    return
  }

  if (hookName === "sessionStart") {
    void cleanupStaleStateFiles()
  }

  const cmux = createCmuxClient({
    binary: config.cmuxBin,
    environment,
    logger,
    transport: config.transport,
  })
  const projectLabel = projectLabelForCwd(event.cwd)

  await logger.log("debug", "calling withRuntimeState", {
    cwd: event.cwd,
    workspaceID: environment.workspaceID,
  })

  await withRuntimeState(event.cwd, environment.workspaceID, async (currentState) => {
    await logger.log("debug", "inside withRuntimeState callback", {
      hasCurrentState: currentState !== null,
      currentPhase: currentState?.phase,
    })

    const previousState =
      currentState ?? createRuntimeState(event.cwd, environment.workspaceID, event.timestamp)
    const nextState = reduceRuntimeState(previousState, event, environment.workspaceID)

    await logger.log("debug", "state reduced", {
      previousPhase: previousState.phase,
      nextPhase: nextState.phase,
      eventType: event.type,
    })

    await emitEventEffects(cmux, config, projectLabel, previousState, nextState, event, logger)
    return nextState
  })

  await logger.log("debug", "processHook complete", { hookName })
}
