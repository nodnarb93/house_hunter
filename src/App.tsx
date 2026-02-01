import { Routes, Route, Link, Navigate } from 'react-router-dom'
import Scrapers from './pages/Scrapers'
import Filters from './pages/Filters'
import Schedule from './pages/Schedule'
import Settings from './pages/Settings'
import Runs from './pages/Runs'

function App() {
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/scrapers">Scrapers</Link>
        <Link to="/filters">Filters</Link>
        <Link to="/schedule">Schedule</Link>
        <Link to="/settings">Settings</Link>
        <Link to="/runs">Last runs</Link>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/scrapers" replace />} />
          <Route path="/scrapers" element={<Scrapers />} />
          <Route path="/filters" element={<Filters />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/runs" element={<Runs />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
