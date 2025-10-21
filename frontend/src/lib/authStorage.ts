/** Fields cached locally for the logged-in user. */
type StoredUser = {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  display_name: string
}

export type StoredAuth = {
  user: StoredUser
  access: string
  refresh: string
}

const STORAGE_KEY = 'anchorpoint.auth'

const isBrowser = typeof window !== 'undefined'

const safeParse = (value: string | null): StoredAuth | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as StoredAuth
  } catch {
    return null
  }
}

/** Load auth payload from storage (if available). */
export const loadAuth = (): StoredAuth | null => {
  if (!isBrowser) return null
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

/** Persist the auth payload in localStorage. */
export const storeAuth = (auth: StoredAuth): void => {
  if (!isBrowser) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
}

/** Remove auth state from storage completely. */
export const clearAuth = (): void => {
  if (!isBrowser) return
  window.localStorage.removeItem(STORAGE_KEY)
}

export const getAccessToken = (): string | null => loadAuth()?.access ?? null

export const getRefreshToken = (): string | null => loadAuth()?.refresh ?? null

/** Update only the access token while leaving refresh/user intact. */
export const updateAccessToken = (token: string): StoredAuth | null => {
  const existing = loadAuth()
  if (!existing) return null
  const next = { ...existing, access: token }
  storeAuth(next)
  return next
}
