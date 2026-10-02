import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from './App'
import { formatDate } from './utils/format'
import { saveDecision } from './utils/storage'
import indexHtml from '../index.html?raw'
import caddyfile from '../Caddyfile?raw'

/** Routes are lazy, so wait for the page heading before poking at it. */
async function renderAt(path: string) {
  const r = render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 1 })
  return r
}

describe('headings', () => {
  it('Home has an h1', async () => {
    await renderAt('/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Big Decisions')
  })
  it('New has an h1', async () => {
    await renderAt('/new')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
  it('unknown routes render a NotFound page', async () => {
    await renderAt('/nope/nothing')
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })
  it('missing decision shows an h1', async () => {
    await renderAt('/decision/missing')
    expect(await screen.findByRole('heading', { level: 1, name: 'Decision not found' })).toBeInTheDocument()
  })
})

describe('new decision form', () => {
  it('labels inputs and exposes quick call weight state with aria-pressed', async () => {
    const user = userEvent.setup()
    await renderAt('/new')
    await user.type(screen.getByRole('textbox', { name: 'Decision title' }), 'Move house')
    await user.click(screen.getByRole('button', { name: /Quick call/ }))
    expect(screen.getByRole('textbox', { name: 'Reason for 1' })).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Weight for reason for 1' })
    const [minor, , major] = Array.from(group.querySelectorAll('button'))
    expect(minor).toHaveAttribute('aria-pressed', 'true')
    expect(major).toHaveAttribute('aria-pressed', 'false')
    await user.click(major)
    expect(major).toHaveAttribute('aria-pressed', 'true')
    expect(minor).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('detail page', () => {
  it('wraps long unbroken titles', async () => {
    const d = saveDecision({ title: 'x'.repeat(300), pros: [{ text: 'y'.repeat(100), weight: 1 }] })
    await renderAt(`/decision/${d.id}`)
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('break-words')
  })
  it('shows a legacy decision stored in the v1 format', async () => {
    localStorage.setItem(
      'decisions',
      JSON.stringify([
        { id: '1', title: 'Old one', pros: [{ text: 'p', weight: 2 }], cons: [], createdAt: '2025-03-04T00:00:00Z', recommendation: 'lean yes' },
      ]),
    )
    await renderAt('/decision/1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Old one' })).toBeInTheDocument()
  })
})

describe('dates', () => {
  it('formats day-first in en-AU by default override', async () => {
    expect(formatDate('2025-03-04T12:00:00Z', 'en-AU')).toMatch(/^4 Mar 2025$/)
    expect(formatDate('2025-03-04T12:00:00Z')).toMatch(/^4 Mar 2025$/)
  })
  it('uses the supplied locale', async () => {
    expect(formatDate('2025-03-04T12:00:00Z', 'en-US')).toMatch(/Mar 4, 2025/)
  })
  it('returns empty for invalid dates', async () => {
    expect(formatDate('garbage')).toBe('')
  })
})

describe('static config', () => {
  it('index.html has the product title and no vite.svg favicon', async () => {
    expect(indexHtml).toContain('<title>Big Decisions</title>')
    expect(indexHtml).not.toContain('vite.svg')
    expect(indexHtml).toContain('href="/favicon.svg"')
  })
  it('self-hosts its fonts: preloaded woff2, no font CDN, no Inter', async () => {
    expect(indexHtml).toMatch(/rel="preload" href="\/fonts\/switzer-400\.woff2" as="font"/)
    expect(indexHtml).not.toMatch(/fonts\.googleapis|fonts\.gstatic|use\.typekit|Inter/)
  })
  it('Caddyfile has SPA fallback and security headers', async () => {
    expect(caddyfile).toMatch(/try_files\s+\{path\}\s+\{path\}\/\s+\/index\.html/)
    for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Content-Security-Policy']) {
      expect(caddyfile).toContain(h)
    }
  })
})
