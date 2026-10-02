import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from './App'
import { getDecisionById, loadDecisions, saveDecision, saveMatrixDecision } from './utils/storage'
import { exampleMatrix } from './lib/example'

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

const lede = () => document.querySelector('.lede') as HTMLElement

describe('create a matrix decision', () => {
  it('refuses to save blanks, then saves a named matrix and opens it', async () => {
    const user = userEvent.setup()
    await renderAt('/new')
    await user.click(screen.getByRole('button', { name: 'Save decision' }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Give the decision a title.')
    expect(alert).toHaveTextContent('Name every option')
    expect(loadDecisions()).toHaveLength(0)

    await user.type(screen.getByRole('textbox', { name: 'Decision title' }), 'Which car?')
    await user.type(screen.getByRole('textbox', { name: 'Option 1 name' }), 'Corolla')
    await user.type(screen.getByRole('textbox', { name: 'Option 2 name' }), 'Mazda 3')
    await user.click(screen.getByRole('button', { name: 'Add an option' }))
    await user.type(screen.getByRole('textbox', { name: 'Option 3 name' }), 'i30')
    await user.type(screen.getByRole('textbox', { name: 'What matters 1 name' }), 'Price')
    await user.type(screen.getByRole('textbox', { name: 'What matters 2 name' }), 'Comfort')
    // Remove the third option again.
    await user.click(screen.getByRole('button', { name: 'Remove option 3' }))
    expect(screen.queryByRole('textbox', { name: 'Option 3 name' })).toBeNull()

    // Score with the keyboard on the live board.
    const cell = screen.getByRole('slider', { name: 'Mazda 3, Price score out of 10' })
    cell.focus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('slider', { name: 'Mazda 3, Price score out of 10' })).toHaveAttribute('aria-valuenow', '7')
    expect(lede()).toHaveTextContent('Mazda 3 leads Corolla by 1.00.')

    await user.click(screen.getByRole('button', { name: 'Save decision' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Which car?' })).toBeInTheDocument()
    const [saved] = loadDecisions()
    expect(saved.mode).toBe('matrix')
    if (saved.mode !== 'matrix') throw new Error('expected matrix')
    expect(saved.options.map((o) => o.name)).toEqual(['Corolla', 'Mazda 3'])
    expect(saved.criteria.map((c) => c.name)).toEqual(['Price', 'Comfort'])
  })

  it('switches mode with the M and Q keys when not typing', async () => {
    const user = userEvent.setup()
    await renderAt('/new')
    const quick = screen.getByRole('button', { name: /Quick call/ })
    await user.keyboard('q')
    expect(quick).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('m')
    expect(screen.getByRole('button', { name: /Matrix/ })).toHaveAttribute('aria-pressed', 'true')
    // Typing a q in the title does not switch.
    await user.type(screen.getByRole('textbox', { name: 'Decision title' }), 'q')
    expect(screen.getByRole('button', { name: /Matrix/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('quick call', () => {
  it('saves a pros/cons decision and shows the tally verdict', async () => {
    const user = userEvent.setup()
    await renderAt('/new')
    await user.click(screen.getByRole('button', { name: /Quick call/ }))
    await user.type(screen.getByRole('textbox', { name: 'Decision title' }), 'Buy the e-bike?')
    await user.type(screen.getByRole('textbox', { name: 'Reason for 1' }), 'Saves fuel')
    await user.click(within(screen.getByRole('group', { name: 'Weight for reason for 1' })).getByRole('button', { name: 'Major' }))
    await user.type(screen.getByRole('textbox', { name: 'Reason against 1' }), 'Cost')
    expect(lede()).toHaveTextContent('Lean yes, 3 to 1.')
    await user.click(screen.getByRole('button', { name: 'Save decision' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Buy the e-bike?' })).toBeInTheDocument()
    expect(screen.getByText('Saves fuel')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'For 3, against 1' })).toBeInTheDocument()
  })

  it('keeps a migrated v1 decision editable as a quick call', async () => {
    localStorage.setItem(
      'decisions',
      JSON.stringify([{ id: '42', title: 'Old one', pros: [{ text: 'p', weight: 2 }], cons: [], createdAt: '2025-03-04T00:00:00Z', recommendation: 'lean yes' }]),
    )
    const user = userEvent.setup()
    await renderAt('/decision/42/edit')
    expect(screen.getByRole('textbox', { name: 'Reason for 1' })).toHaveValue('p')
    expect(screen.queryByRole('button', { name: /Matrix/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add a reason against' }))
    await user.type(screen.getByRole('textbox', { name: 'Reason against 1' }), 'Risky')
    await user.click(within(screen.getByRole('group', { name: 'Weight for reason against 1' })).getByRole('button', { name: 'Major' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Old one' })).toBeInTheDocument()
    const d = getDecisionById('42')!
    expect(d.mode).toBe('proscons')
    if (d.mode !== 'proscons') throw new Error('expected proscons')
    expect(d.cons.map((c) => c.text)).toEqual(['Risky'])
    expect(d.recommendation).toBe('lean no')
  })
})

describe('detail board', () => {
  it('re-ranks live when a weight changes, lists what would flip it, and autosaves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const d = saveMatrixDecision(exampleMatrix())
    await renderAt(`/decision/${d.id}`)
    expect(lede()).toHaveTextContent('Fieldnote leads Tidewater Studio by 0.37.')
    expect(screen.getByRole('heading', { name: 'What would flip it' })).toBeInTheDocument()
    const rowNames = () => Array.from(document.querySelectorAll('.mrow:not(.mhead) .mname')).map((n) => n.textContent)
    expect(rowNames()[0]).toBe('Fieldnote')

    // Location to 0 and Stability to 5 hands it to Harbour Bank.
    fireEvent.change(screen.getByRole('slider', { name: 'Location' }), { target: { value: '0' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Stability' }), { target: { value: '5' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Growth' }), { target: { value: '0' } })
    expect(rowNames()[0]).toBe('Harbour Bank')
    expect(lede()).toHaveTextContent(/^Harbour Bank leads/)
    expect(screen.getByRole('button', { name: 'Undo changes' })).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    const stored = getDecisionById(d.id)!
    if (stored.mode !== 'matrix') throw new Error('expected matrix')
    expect(stored.criteria.find((c) => c.name === 'Growth')!.weight).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Undo changes' }))
    expect(rowNames()[0]).toBe('Fieldnote')
    vi.useRealTimers()
  })

  it('sets scores with arrow keys, digits and typed input', async () => {
    const user = userEvent.setup()
    const d = saveMatrixDecision(exampleMatrix())
    await renderAt(`/decision/${d.id}`)
    const name = 'Harbour Bank, Location score out of 10'
    screen.getByRole('slider', { name }).focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('slider', { name })).toHaveAttribute('aria-valuenow', '2')
    await user.keyboard('8')
    expect(screen.getByRole('slider', { name })).toHaveAttribute('aria-valuenow', '8')
    await user.keyboard('{End}')
    expect(screen.getByRole('slider', { name })).toHaveAttribute('aria-valuenow', '10')
    expect(screen.getByRole('slider', { name })).toHaveFocus()

    const typed = screen.getByRole('spinbutton', { name: 'Harbour Bank, Location score' })
    fireEvent.change(typed, { target: { value: '4' } })
    expect(screen.getByRole('slider', { name })).toHaveAttribute('aria-valuenow', '4')
    fireEvent.change(typed, { target: { value: '99' } })
    expect(screen.getByRole('slider', { name })).toHaveAttribute('aria-valuenow', '10')
  })

  it('copies a summary, exports, and deletes after confirming', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const d = saveMatrixDecision(exampleMatrix())
    await renderAt(`/decision/${d.id}`)
    await user.click(screen.getByRole('button', { name: 'Copy summary' }))
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0][0]).toContain('1. Fieldnote  7.53 / 10')
    expect(screen.getByRole('status')).toHaveTextContent('Summary copied.')

    const create = vi.fn(() => 'blob:x')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(create).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    click.mockRestore()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(getDecisionById(d.id)).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(getDecisionById(d.id)).toBeUndefined()
    expect(await screen.findByRole('heading', { level: 1, name: 'Big Decisions' })).toBeInTheDocument()
  })

  it('reports clipboard failure instead of failing silently', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true })
    const d = saveDecision({ title: 'Q', pros: [{ text: 'a', weight: 1 }] })
    await renderAt(`/decision/${d.id}`)
    await user.click(screen.getByRole('button', { name: 'Copy summary' }))
    expect(screen.getByRole('status')).toHaveTextContent('blocked the clipboard')
  })
})

describe('edit a matrix decision', () => {
  it('prefills, edits names and title, and saves in place', async () => {
    const user = userEvent.setup()
    const d = saveMatrixDecision(exampleMatrix())
    await renderAt(`/decision/${d.id}/edit`)
    expect(screen.getByRole('heading', { level: 1, name: 'Edit decision' })).toBeInTheDocument()
    const title = screen.getByRole('textbox', { name: 'Decision title' })
    expect(title).toHaveValue('Which offer do I take?')
    await user.clear(title)
    await user.type(title, 'Which job?')
    await user.click(screen.getByRole('button', { name: 'Remove what matters 5' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Which job?' })).toBeInTheDocument()
    expect(loadDecisions()).toHaveLength(1)
    const saved = getDecisionById(d.id)!
    if (saved.mode !== 'matrix') throw new Error('expected matrix')
    expect(saved.criteria.map((c) => c.name)).toEqual(['Salary', 'Location', 'Growth', 'Stability'])
    expect(Object.keys(saved.scores.harbour)).not.toContain('tea')
  })

  it('shows not found for a missing id', async () => {
    await renderAt('/decision/nope/edit')
    expect(screen.getByRole('heading', { level: 1, name: 'Decision not found' })).toBeInTheDocument()
  })
})

describe('home', () => {
  it('lists decisions newest first with their verdicts', async () => {
    saveDecision({ title: 'Older quick one', pros: [{ text: 'a', weight: 3 }] })
    saveMatrixDecision(exampleMatrix())
    await renderAt('/')
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/decision/'))
    expect(links[0]).toHaveTextContent('Which offer do I take?')
    expect(links[0]).toHaveTextContent('Fieldnote leads by 0.37')
    expect(links[1]).toHaveTextContent('Lean yes, 3 to 0.')
  })

  it('opens a worked example from the empty state', async () => {
    const user = userEvent.setup()
    await renderAt('/')
    expect(screen.getByText('Nothing weighed yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open a worked example' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Which offer do I take?' })).toBeInTheDocument()
    expect(loadDecisions()).toHaveLength(1)
  })
})
