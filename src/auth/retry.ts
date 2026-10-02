// Retries a task with growing delays, and immediately when the browser comes back online,
// until it succeeds, runs out of attempts, or is cancelled.
//
// Used for creating the profile at sign-in: a single failed attempt (Firestore briefly
// "offline", a flaky phone network) used to leave a signed-in user with no profile, which
// silently broke usernames, friend requests and the leaderboard.

export interface RetryOptions {
  delaysMs?: number[]
  onError?: (e: unknown, attempt: number) => void
  // Injectable for tests.
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
  online?: { add: (fn: () => void) => void; remove: (fn: () => void) => void }
}

export function retryUntilDone(task: () => Promise<unknown>, opts: RetryOptions = {}): () => void {
  const delays = opts.delaysMs ?? [2000, 4000, 8000, 16000, 32000]
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>))
  const online = opts.online ?? {
    add: (fn) => window.addEventListener('online', fn),
    remove: (fn) => window.removeEventListener('online', fn),
  }

  let attempt = 0
  let done = false
  let running = false
  let timer: unknown = null

  const stop = () => {
    done = true
    if (timer !== null) clearTimer(timer)
    online.remove(onOnline)
  }

  const run = () => {
    if (done || running) return
    running = true
    timer = null
    task().then(
      () => {
        running = false
        stop()
      },
      (e) => {
        running = false
        opts.onError?.(e, attempt)
        if (done) return
        if (attempt >= delays.length) return stop()
        timer = setTimer(run, delays[attempt++])
      },
    )
  }

  function onOnline() {
    if (done || running) return
    if (timer !== null) clearTimer(timer)
    run()
  }

  online.add(onOnline)
  run()
  return stop
}
