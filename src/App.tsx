import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

// The board (editor and detail) loads on demand so the home list stays light.
const NewDecision = lazy(() => import('./pages/NewDecision'))
const DecisionDetail = lazy(() => import('./pages/DecisionDetail'))

export function Bar() {
  return (
    <header className="bar">
      <Link to="/" className="mark">
        <span className="mark-sq" aria-hidden="true" />
        Big Decisions
      </Link>
      <nav aria-label="Main">
        <Link to="/new" className="btn primary small">
          New decision
        </Link>
      </nav>
    </header>
  )
}

export function AppRoutes() {
  return (
    <Suspense fallback={<main id="main" className="loading" aria-busy="true" />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewDecision key="new" />} />
        <Route path="/decision/:id" element={<DecisionDetail />} />
        <Route path="/decision/:id/edit" element={<NewDecision key="edit" />} />
        <Route path="/example" element={<DecisionDetail example="matrix" key="ex-m" />} />
        <Route path="/example/quick" element={<DecisionDetail example="quick" key="ex-q" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

function App() {
  return (
    <BrowserRouter>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Bar />
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
