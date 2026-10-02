import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import NewDecision from './pages/NewDecision'
import DecisionDetail from './pages/DecisionDetail'
import NotFound from './pages/NotFound'
import { formatDate } from './utils/format'
import { saveDecision } from './utils/storage'
import indexHtml from '../index.html?raw'
import caddyfile from '../Caddyfile?raw'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewDecision />} />
        <Route path="/decision/:id" element={<DecisionDetail />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('headings', () => {
  it('Home has an h1', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Big Decisions')
  })
  it('New has an h1', () => {
    renderAt('/new')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
  it('unknown routes render a NotFound page', () => {
    renderAt('/nope/nothing')
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })
  it('missing decision shows an h1', async () => {
    renderAt('/decision/missing')
    expect(await screen.findByRole('heading', { level: 1, name: 'Decision not found' })).toBeInTheDocument()
  })
})

describe('new decision form', () => {
  it('labels inputs and exposes weight state with aria-pressed', async () => {
    const user = userEvent.setup()
    renderAt('/new')
    const title = screen.getByRole('textbox', { name: 'Decision title' })
    await user.type(title, 'Move house')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('textbox', { name: 'pro 1' })).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Weight for pro 1' })
    const minor = group.querySelector('button')!
    expect(minor).toHaveAttribute('aria-pressed', 'true')
    const major = screen.getAllByRole('button', { name: 'Major' })[0]
    expect(major).toHaveAttribute('aria-pressed', 'false')
    await user.click(major)
    expect(major).toHaveAttribute('aria-pressed', 'true')
    expect(minor).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('detail page', () => {
  it('wraps long unbroken titles', () => {
    const d = saveDecision({ title: 'x'.repeat(300), pros: [{ text: 'y'.repeat(100), weight: 1 }] })
    renderAt(`/decision/${d.id}`)
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('break-words')
  })
  it('shows a legacy decision stored in the v1 format', async () => {
    localStorage.setItem(
      'decisions',
      JSON.stringify([
        { id: '1', title: 'Old one', pros: [{ text: 'p', weight: 2 }], cons: [], createdAt: '2025-03-04T00:00:00Z', recommendation: 'lean yes' },
      ]),
    )
    renderAt('/decision/1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Old one' })).toBeInTheDocument()
  })
})

describe('dates', () => {
  it('formats day-first in en-AU by default override', () => {
    expect(formatDate('2025-03-04T12:00:00Z', 'en-AU')).toMatch(/^4 Mar 2025$/)
  })
  it('uses the supplied locale', () => {
    expect(formatDate('2025-03-04T12:00:00Z', 'en-US')).toMatch(/Mar 4, 2025/)
  })
  it('returns empty for invalid dates', () => {
    expect(formatDate('garbage')).toBe('')
  })
})

describe('static config', () => {
  it('index.html has the product title and no vite.svg favicon', () => {
    expect(indexHtml).toContain('<title>Big Decisions</title>')
    expect(indexHtml).not.toContain('vite.svg')
  })
  it('Caddyfile has SPA fallback and security headers', () => {
    expect(caddyfile).toMatch(/try_files\s+\{path\}\s+\{path\}\/\s+\/index\.html/)
    for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Content-Security-Policy']) {
      expect(caddyfile).toContain(h)
    }
  })
})
