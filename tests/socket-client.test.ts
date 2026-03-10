import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { unlinkSync } from "node:fs"
import { createServer, type Server } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { socketRequest } from "../src/cmux/socket-client.js"

function createTempSocketPath(): string {
  return join(tmpdir(), `cmux-test-${randomUUID()}.sock`)
}

function listenOnSocket(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve) => server.listen(socketPath, resolve))
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

test("successful request returns server response", async () => {
  const socketPath = createTempSocketPath()
  const server = createServer((conn) => {
    conn.on("data", () => {
      conn.write("OK\n")
    })
  })

  try {
    await listenOnSocket(server, socketPath)

    const outcome = await socketRequest({
      socketPath,
      payload: "ping",
      timeoutMs: 2000,
    })

    assert.equal(outcome.error, undefined)
    assert.equal(outcome.response, "OK\n")
  } finally {
    await closeServer(server)
    try {
      unlinkSync(socketPath)
    } catch {}
  }
})

test("server sends JSON response", async () => {
  const socketPath = createTempSocketPath()
  const jsonPayload = '{"id":"1","ok":true}'
  const server = createServer((conn) => {
    conn.on("data", () => {
      conn.write(jsonPayload)
    })
  })

  try {
    await listenOnSocket(server, socketPath)

    const outcome = await socketRequest({
      socketPath,
      payload: "request",
      timeoutMs: 2000,
    })

    assert.equal(outcome.error, undefined)
    assert.equal(outcome.response, jsonPayload)
  } finally {
    await closeServer(server)
    try {
      unlinkSync(socketPath)
    } catch {}
  }
})

test("connection refused on non-existent socket returns ENOENT", async () => {
  const socketPath = createTempSocketPath()

  const outcome = await socketRequest({
    socketPath,
    payload: "ping",
    timeoutMs: 2000,
  })

  assert.equal(outcome.response, undefined)
  assert.ok(outcome.error)
  assert.equal(outcome.error.code, "ENOENT")
})

test("timeout when server never responds returns ETIMEDOUT", async () => {
  const socketPath = createTempSocketPath()
  const connections: import("node:net").Socket[] = []
  const server = createServer((conn) => {
    connections.push(conn)
    // Accept connection but never send data
  })

  try {
    await listenOnSocket(server, socketPath)

    const outcome = await socketRequest({
      socketPath,
      payload: "ping",
      timeoutMs: 100,
    })

    assert.equal(outcome.response, undefined)
    assert.ok(outcome.error)
    assert.equal(outcome.error.code, "ETIMEDOUT")
  } finally {
    for (const conn of connections) conn.destroy()
    await closeServer(server)
    try {
      unlinkSync(socketPath)
    } catch {}
  }
})
