import { Routes, Route, Link } from 'react-router-dom'
import TripsList from '../features/trips/TripsList'

export default function App(){
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Climbing Guide</h1>
        <nav className="space-x-4">
          <Link to="/" className="underline">Trips</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<TripsList/>} />
      </Routes>
    </div>
  )
}
