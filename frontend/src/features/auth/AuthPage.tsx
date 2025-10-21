import { ChangeEvent, FormEvent, useState } from 'react'
import { useAuth } from '../../lib/auth'

type Mode = 'login' | 'register'

const initialForm = {
  email: '',
  password: '',
  first_name: '',
  last_name: '',
  display_name: ''
}

/** Minimal login/register screen used before we have a dashboard shell. */
export default function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleMode = () => {
    setMode(prev => (prev === 'login' ? 'register' : 'login'))
    setForm(initialForm)
    setError(null)
  }

  const handleChange = (field: string) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: event.target.value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login({
          email: form.email,
          password: form.password
        })
      } else {
        await register({
          email: form.email,
          password: form.password,
          first_name: form.first_name,
          last_name: form.last_name,
          display_name: form.display_name || undefined
        })
      }
    } catch (err: any) {
      // Surface the most relevant message returned from the API response shape.
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.email?.[0] ||
        err?.response?.data?.password?.[0] ||
        err?.message ||
        'Something went wrong. Please try again.'
      setError(String(detail))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">Anchorpoint</h1>
        <p className="text-gray-600">{mode === 'login' ? 'Sign in to continue' : 'Create an account'}</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={handleChange('email')}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={handleChange('password')}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        {mode === 'register' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium">First name</label>
                <input
                  type="text"
                  required
                  value={form.first_name}
                  onChange={handleChange('first_name')}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Last name</label>
                <input
                  type="text"
                  required
                  value={form.last_name}
                  onChange={handleChange('last_name')}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Display name (optional)</label>
              <input
                type="text"
                value={form.display_name}
                onChange={handleChange('display_name')}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </>
        )}
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-70"
        >
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>
      <div className="text-center text-sm text-gray-600">
        {mode === 'login' ? (
          <button onClick={toggleMode} className="underline">
            Need an account? Register
          </button>
        ) : (
          <button onClick={toggleMode} className="underline">
            Already have an account? Sign in
          </button>
        )}
      </div>
    </div>
  )
}
