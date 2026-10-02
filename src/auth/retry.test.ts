import { describe, expect, it } from 'vitest'
import { retryUntilDone } from './retry'

// A controllable clock and "online" event so the test is synchronous and deterministic.
function harness() {
  const timers: { fn: () => void; ms: number; id: number }[] = []
  let nextId = 0
  const listeners = new Set<() => void>()
  return {
    timers,
    listeners,
    opts: {
      setTimer: (fn: () => void, ms: number) => {
        const t = { fn, ms, id: nextId++ }
        timers.push(t)
        return t.id
      },
      clearTimer: (id: unknown) => {
        const i = timers.findIndex((t) => t.id === id)
        if (i >= 0) timers.splice(i, 1)
      },
      online: { add: (fn: () => void) => listeners.add(fn), remove: (fn: () => void) => listeners.delete(fn) },
      delaysMs: [10, 20, 40],
    },
    fireNext: () => timers.shift()!.fn(),
    goOnline: () => [...listeners].forEach((fn) => fn()),
  }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('retryUntilDone', () => {
  it('runs once and stops on success', async () => {
    const h = harness()
    let calls = 0
    retryUntilDone(async () => void calls++, h.opts)
    await flush()
    expect(calls).toBe(1)
    expect(h.timers).toEqual([])
    expect(h.listeners.size).toBe(0)
  })

  it('retries with growing delays until it succeeds', async () => {
    const h = harness()
    let calls = 0
    retryUntilDone(async () => {
      calls++
      if (calls < 3) throw new Error('offline')
    }, h.opts)
    await flush()
    expect(h.timers.map((t) => t.ms)).toEqual([10])
    h.fireNext()
    await flush()
    expect(h.timers.map((t) => t.ms)).toEqual([20])
    h.fireNext()
    await flush()
    expect(calls).toBe(3)
    expect(h.timers).toEqual([])
    expect(h.listeners.size).toBe(0)
  })

  it('gives up after the last delay', async () => {
    const h = harness()
    let calls = 0
    const errors: number[] = []
    retryUntilDone(async () => {
      calls++
      throw new Error('down')
    }, { ...h.opts, onError: (_, n) => errors.push(n) })
    for (let i = 0; i < 3; i++) {
      await flush()
      h.fireNext()
    }
    await flush()
    expect(calls).toBe(4) // first try + 3 retries
    expect(h.timers).toEqual([])
    expect(h.listeners.size).toBe(0)
    expect(errors).toEqual([0, 1, 2, 3])
  })

  it('retries at once when the browser comes back online', async () => {
    const h = harness()
    let calls = 0
    retryUntilDone(async () => {
      calls++
      if (calls < 2) throw new Error('offline')
    }, h.opts)
    await flush()
    expect(h.timers.length).toBe(1)
    h.goOnline()
    await flush()
    expect(calls).toBe(2)
    expect(h.timers).toEqual([]) // the pending timer was cancelled
  })

  it('cancelling stops further attempts', async () => {
    const h = harness()
    let calls = 0
    const cancel = retryUntilDone(async () => {
      calls++
      throw new Error('offline')
    }, h.opts)
    await flush()
    cancel()
    expect(h.timers).toEqual([])
    h.goOnline()
    await flush()
    expect(calls).toBe(1)
  })

  it('does not start a second attempt while one is running', async () => {
    const h = harness()
    let calls = 0
    let release!: () => void
    retryUntilDone(() => {
      calls++
      return new Promise<void>((r) => (release = r))
    }, h.opts)
    h.goOnline()
    expect(calls).toBe(1)
    release()
    await flush()
  })
})
