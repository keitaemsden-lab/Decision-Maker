import './App.css'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import NewDecision from './pages/NewDecision'
import DecisionDetail from './pages/DecisionDetail'

function NavBar() {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold text-gray-900 hover:text-indigo-600 transition-colors">
          Decision Maker
        </Link>
        <Link
          to="/new"
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          <span className="leading-none">+</span> New Decision
        </Link>
      </div>
    </nav>
  )
}

function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewDecision />} />
        <Route path="/decision/:id" element={<DecisionDetail />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
