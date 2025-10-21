import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'

type Trip = {
  id: number
  title: string
  location: string
  start: string
  end: string
}

export default function TripsList(){
  const { isAuthenticated } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['trips'],
    queryFn: async () => (await api.get('/api/trips/')).data,
    // Avoid calling the API before the user completes authentication.
    enabled: isAuthenticated
  })

  if (!isAuthenticated) return null
  if (isLoading) return <div>Loading…</div>
  if (error) return <div className="text-red-600">Failed to load trips</div>

  const results: Trip[] = data?.results || data

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {results?.map((t: Trip) => (
        <div key={t.id} className="card">
          <h3 className="text-xl font-semibold">{t.title}</h3>
          <p>{t.location} · {new Date(t.start).toLocaleDateString()}</p>
        </div>
      ))}
      {!results?.length && <div>No trips yet.</div>}
    </div>
  )
}
