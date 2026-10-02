// Each module is fetched once, on first use.
//
// After a deploy, a page still running the previous build asks for chunk files that no
// longer exist. Reload once so it picks up the new build, instead of leaving sign-in broken.
const RELOAD_FLAG = 'starbook:reloaded-for-chunk'

function once<T>(load: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null
  return () =>
    (p ??= load().then(
      (m) => {
        sessionStorage.removeItem(RELOAD_FLAG)
        return m
      },
      (e) => {
        p = null
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1')
          location.reload()
        }
        throw e
      },
    ))
}

export const loadAuth = once(() => import('./app'))
export const loadDb = once(() => import('./db'))
