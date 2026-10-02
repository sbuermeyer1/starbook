// Each module is fetched once, on first use.
let authModule: Promise<typeof import('./app')> | null = null
let dbModule: Promise<typeof import('./db')> | null = null

export const loadAuth = () => (authModule ??= import('./app'))
export const loadDb = () => (dbModule ??= import('./db'))
