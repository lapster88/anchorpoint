import axios from 'axios'

const dockerHostnames = new Set(['frontend', 'playwright'])

function resolveBaseURL() {
  const envBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim()

  if (envBase) {
    if (typeof window !== 'undefined') {
      try {
        const candidate = new URL(envBase, window.location.origin)
        if (candidate.hostname === 'backend' && !dockerHostnames.has(window.location.hostname)) {
          candidate.hostname = window.location.hostname || 'localhost'
        }
        if (candidate.pathname === '/') {
          return candidate.origin
        }
        return candidate.toString().replace(/\/$/, '')
      } catch {
        return envBase
      }
    }
    return envBase
  }

  if (typeof window !== 'undefined') {
    if (dockerHostnames.has(window.location.hostname)) {
      return `${window.location.protocol}//backend:8000`
    }
    const host = window.location.hostname || 'localhost'
    return `${window.location.protocol}//${host}:8000`
  }

  return 'http://localhost:8000'
}

export const api = axios.create({
  baseURL: resolveBaseURL()
})
