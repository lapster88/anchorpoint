import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import axios, { AxiosRequestConfig } from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import {
  StoredAuth,
  clearAuth as clearStoredAuth,
  loadAuth,
  storeAuth,
  updateAccessToken
} from './authStorage'

/** Email + password used for login or registration. */
type AuthCredentials = {
  email: string
  password: string
}

/** Payload accepted by the register API call. */
type RegisterPayload = AuthCredentials & {
  first_name: string
  last_name: string
  display_name?: string
}

/** Fields a user can update from their profile page. */
type ProfileUpdatePayload = Partial<{
  email: string
  first_name: string
  last_name: string
  display_name: string | null
}>

/** Surface area exposed to consumers of the auth context. */
type AuthContextValue = {
  user: StoredAuth['user'] | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  login: (payload: AuthCredentials) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  updateProfile: (payload: ProfileUpdatePayload) => Promise<void>
  changePassword: (payload: { current_password: string; new_password: string }) => Promise<void>
  logout: () => void
}

type SetAuthInput =
  | StoredAuth
  | null
  | ((prev: StoredAuth | null) => StoredAuth | null)

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const initialAuthState = loadAuth()
if (initialAuthState?.access) {
  api.defaults.headers.common.Authorization = `Bearer ${initialAuthState.access}`
}

/**
 * Provides authenticated state, token lifecycle management, and storage sync.
 */
export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [auth, setAuthState] = useState<StoredAuth | null>(() => initialAuthState)
  const queryClient = useQueryClient()

  const setAuth = useCallback(
    (value: SetAuthInput) => {
      setAuthState(prev => {
        const next = typeof value === 'function' ? value(prev) : value

        if (next) {
          storeAuth(next)
        } else {
          if (prev) {
            queryClient.clear()
          }
          clearStoredAuth()
        }
        return next
      })
    },
    [queryClient]
  )

  useEffect(() => {
    if (auth?.access) {
      api.defaults.headers.common.Authorization = `Bearer ${auth.access}`
    } else {
      delete api.defaults.headers.common.Authorization
    }
  }, [auth?.access])

  // Keep axios requests authenticated and refresh tokens transparently.
  useEffect(() => {
    let refreshRequest: Promise<string> | null = null

    const requestInterceptor = api.interceptors.request.use(config => {
      if (auth?.access) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${auth.access}`
        }
      }
      return config
    })

    const responseInterceptor = api.interceptors.response.use(
      response => response,
      async error => {
        const { response, config } = error
        if (!response) return Promise.reject(error)
        const retriableConfig = config as AxiosRequestConfig & { __isRetryRequest?: boolean }

        if (
          response.status === 401 &&
          auth?.refresh &&
          !retriableConfig.__isRetryRequest
        ) {
          const attemptRefresh = async () => {
            const refreshClient = axios.create({ baseURL: api.defaults.baseURL })
            const refreshed = await refreshClient.post('/api/auth/refresh/', {
              refresh: auth.refresh
            })
            return refreshed.data.access as string
          }

          if (!refreshRequest) {
            refreshRequest = attemptRefresh()
              .then(token => {
                const updated = updateAccessToken(token)
                if (updated) {
                  setAuth(updated)
                } else {
                  setAuth(null)
                }
                return token
              })
              .catch(refreshError => {
                setAuth(null)
                throw refreshError
              })
              .finally(() => {
                refreshRequest = null
              })
          }

          try {
            const newAccess = await refreshRequest
            retriableConfig.__isRetryRequest = true
            retriableConfig.headers = {
              ...(retriableConfig.headers ?? {}),
              Authorization: `Bearer ${newAccess}`
            }
            return api(retriableConfig)
          } catch (refreshError) {
            return Promise.reject(refreshError)
          }
        }

        if (response.status === 401) {
          setAuth(null)
        }
        return Promise.reject(error)
      }
    )

    return () => {
      api.interceptors.request.eject(requestInterceptor)
      api.interceptors.response.eject(responseInterceptor)
    }
  }, [auth, setAuth])

  const login = useCallback(
    /** Submit credentials to the backend and persist the resulting JWT pair. */
    async ({ email, password }: AuthCredentials) => {
      const { data } = await api.post('/api/auth/login/', { email, password })
      const nextAuth: StoredAuth = {
        user: data.user,
        access: data.access,
        refresh: data.refresh
      }
      setAuth(nextAuth)
    },
    [setAuth]
  )

  const register = useCallback(
    /** Create an account and mirror the tokens returned from registration. */
    async ({ email, password, first_name, last_name, display_name }: RegisterPayload) => {
      const payload = {
        email,
        password,
        first_name,
        last_name,
        display_name
      }
      const { data } = await api.post('/api/auth/register/', payload)
      const nextAuth: StoredAuth = {
        user: data.user,
        access: data.access,
        refresh: data.refresh
      }
      setAuth(nextAuth)
    },
    [setAuth]
  )

  const updateProfile = useCallback(
    /** Patch profile fields and sync the auth cache. */
    async (payload: ProfileUpdatePayload) => {
      const { data } = await api.patch('/api/auth/me/', payload)
      setAuth(current => {
        if (!current) return current
        return { ...current, user: data }
      })
      queryClient.invalidateQueries()
    },
    [setAuth, queryClient]
  )

  const changePassword = useCallback(
    /** Verify the current password and rotate it server-side. */
    async (payload: { current_password: string; new_password: string }) => {
      await api.post('/api/auth/change-password/', payload)
    },
    []
  )

  const logout = useCallback(() => {
    setAuth(null)
  }, [setAuth])

  // Re-sync the user profile when we obtain a new access token.
  useEffect(() => {
    if (!auth?.access) return
    let active = true

    const syncUser = async () => {
      try {
        const { data } = await api.get('/api/auth/me/')
        if (!active) return
        setAuth(current => {
          if (!current) return current
          if (current.user.id === data.id && current.user.email === data.email) {
            return current
          }
          return { ...current, user: data }
        })
      } catch (err: any) {
        const status = err?.response?.status
        if (status === 401) {
          setAuth(null)
        }
      }
    }

    syncUser()

    return () => {
      active = false
    }
  }, [auth?.access, setAuth])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: auth?.user ?? null,
      accessToken: auth?.access ?? null,
      refreshToken: auth?.refresh ?? null,
      isAuthenticated: Boolean(auth?.access),
      login,
      register,
      updateProfile,
      changePassword,
      logout
    }),
    [auth, login, register, updateProfile, changePassword, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Access the current authentication state and helpers.
 * Throws when used outside of an <AuthProvider>.
 */
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
