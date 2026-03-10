import test from 'node:test'
import assert from 'node:assert/strict'
import { reduceRuntimeState, createRuntimeState, describeActiveTools } from '../dist/runtime/reducer.js'
import { buildPresentationSnapshot } from '../dist/runtime/renderer.js'

const config = {
  cmuxBin: 'cmux',
  statusKey: 'copilot',
  transport: 'auto',
  progressEnabled: true,
  keepDoneStatus: true,
  logPrompts: true,
  logToolCalls: true,
  logSessionLifecycle: true,
  notifyOnSessionEnd: true,
  notifyOnErrors: true,
  debug: false,
}

test('runtime state tracks prompt, active tools, and completion', () => {
  let state = createRuntimeState('/tmp/project', 'workspace-1', 1)

  state = reduceRuntimeState(
    state,
    {
      type: 'session.start',
      timestamp: 1,
      cwd: '/tmp/project',
      source: 'new',
      initialPrompt: 'Fix the bug',
    },
    'workspace-1',
  )
  assert.equal(state.phase, 'thinking')

  state = reduceRuntimeState(
    state,
    {
      type: 'tool.pre',
      timestamp: 2,
      cwd: '/tmp/project',
      toolName: 'bash',
      summary: 'bash: Run tests',
    },
    'workspace-1',
  )
  assert.equal(state.phase, 'working')
  assert.equal(describeActiveTools(state), 'bash: Run tests')

  state = reduceRuntimeState(
    state,
    {
      type: 'tool.post',
      timestamp: 3,
      cwd: '/tmp/project',
      toolName: 'bash',
      summary: 'bash: Run tests',
      resultType: 'success',
    },
    'workspace-1',
  )
  assert.equal(state.phase, 'thinking')

  state = reduceRuntimeState(
    state,
    {
      type: 'session.end',
      timestamp: 4,
      cwd: '/tmp/project',
      reason: 'complete',
    },
    'workspace-1',
  )
  assert.equal(state.phase, 'done')

  const snapshot = buildPresentationSnapshot(state, config, 'project', 4)
  assert.equal(snapshot.status?.text, 'done')
  assert.equal(snapshot.progress, undefined)
})

test('renderer shows active tool status while work is in progress', () => {
  const state = {
    version: 1,
    cwd: '/tmp/project',
    workspaceID: 'workspace-1',
    updatedAt: 10,
    startedAt: 1,
    phase: 'working',
    activeTools: { bash: 1 },
    toolInvocations: 2,
    completedTools: 1,
    lastToolName: 'bash',
    lastToolSummary: 'bash: Run tests',
  }

  const snapshot = buildPresentationSnapshot(state, config, 'project', 10)
  assert.equal(snapshot.status?.text, 'working: bash: Run tests')
  assert.equal(snapshot.status?.icon, 'terminal')
  assert.ok(snapshot.progress)
  assert.match(snapshot.progress.label, /^project:/)
})
