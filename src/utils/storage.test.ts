import { describe, expect, it, vi } from 'vitest'
import {
  BACKUP_KEY,
  CORRUPT_KEY,
  SCHEMA_VERSION,
  STORAGE_KEY,
  deleteDecision,
  getDecisionById,
  loadDecisions,
  migrateStored,
  saveDecision,
  saveMatrixDecision,
  updateDecision,
} from './storage'

const legacy = [
  {
    id: '1700000000000',
    title: 'Quit my job?',
    pros: [{ id: 'p1', text: 'Freedom', weight: 3 }],
    cons: [{ id: 'c1', text: 'Money', weight: 2 }],
    createdAt: '2025-01-02T03:04:05.000Z',
    recommendation: 'lean yes',
  },
]

describe('migration from v1 (bare array)', () => {
  it('keeps existing pros/cons decisions intact and versions the data', () => {
    const out = migrateStored(legacy)
    expect(out.version).toBe(SCHEMA_VERSION)
    expect(out.decisions).toHaveLength(1)
    expect(out.decisions[0]).toMatchObject({
      id: '1700000000000',
      mode: 'proscons',
      title: 'Quit my job?',
      recommendation: 'lean yes',
      createdAt: '2025-01-02T03:04:05.000Z',
    })
  })
  it('loads legacy localStorage, rewrites it as v2 and keeps a backup of the original', () => {
    const raw = JSON.stringify(legacy)
    localStorage.setItem(STORAGE_KEY, raw)
    const list = loadDecisions()
    expect(list[0].title).toBe('Quit my job?')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.version).toBe(SCHEMA_VERSION)
    expect(localStorage.getItem(BACKUP_KEY)).toBe(raw)
  })
  it('does not overwrite an existing backup on later migrations', () => {
    localStorage.setItem(BACKUP_KEY, 'first')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy))
    loadDecisions()
    expect(localStorage.getItem(BACKUP_KEY)).toBe('first')
  })
  it('recomputes the recommendation and repairs bad data', () => {
    const out = migrateStored([
      {
        id: 'x',
        title: '  ',
        pros: [{ text: 'a', weight: 9 }, { text: '  ', weight: 1 }, 'junk'],
        cons: [{ text: 'b', weight: 'nope' }],
        createdAt: 'not a date',
        recommendation: 'wrong',
      },
      null,
      42,
    ])
    expect(out.decisions).toHaveLength(1)
    const d = out.decisions[0]
    if (d.mode !== 'proscons') throw new Error('mode')
    expect(d.title).toBe('Untitled decision')
    expect(d.pros.map((p) => p.weight)).toEqual([3])
    expect(d.cons.map((p) => p.weight)).toEqual([1])
    expect(d.recommendation).toBe('lean yes')
    expect(Number.isNaN(Date.parse(d.createdAt))).toBe(false)
  })
  it('re-ids legacy Date.now() collisions', () => {
    const out = migrateStored([legacy[0], { ...legacy[0], title: 'Second' }])
    expect(new Set(out.decisions.map((d) => d.id)).size).toBe(2)
    expect(out.decisions[0].id).toBe('1700000000000')
  })
  it('is idempotent on current-version data', () => {
    const once = migrateStored(legacy)
    expect(migrateStored(once)).toEqual(once)
  })
  it('accepts garbage without throwing', () => {
    expect(migrateStored('nope').decisions).toEqual([])
    expect(migrateStored({ version: 2 }).decisions).toEqual([])
  })
})

describe('storage CRUD', () => {
  it('uses unique ids even when saved in the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1)
    const a = saveDecision({ title: 'A', pros: [{ text: 'x', weight: 1 }] })
    const b = saveDecision({ title: 'B', pros: [{ text: 'x', weight: 1 }] })
    expect(a.id).not.toBe(b.id)
    expect(loadDecisions()).toHaveLength(2)
    vi.restoreAllMocks()
  })
  it('saves, reads, updates and deletes pros/cons decisions', () => {
    const d = saveDecision({ title: 'T', pros: [{ text: 'p', weight: 1 }], cons: [{ text: 'c', weight: 3 }] })
    expect(d.recommendation).toBe('lean no')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).version).toBe(SCHEMA_VERSION)
    expect(getDecisionById(d.id)?.title).toBe('T')
    const up = updateDecision(d.id, { cons: [] })
    expect(up && up.mode === 'proscons' && up.recommendation).toBe('lean yes')
    expect(deleteDecision(d.id)).toBe(true)
    expect(deleteDecision(d.id)).toBe(false)
    expect(updateDecision('missing', {})).toBeNull()
  })
  it('round-trips matrix decisions', () => {
    const m = saveMatrixDecision({
      title: 'Laptop',
      options: [{ id: 'o1', name: 'A' }],
      criteria: [{ id: 'c1', name: 'Price', weight: 2 }],
      scores: { o1: { c1: 7 } },
    })
    const back = getDecisionById(m.id)
    expect(back).toMatchObject({ mode: 'matrix', scores: { o1: { c1: 7 } } })
  })
  it('stashes corrupt data instead of silently destroying it', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(loadDecisions()).toEqual([])
    expect(localStorage.getItem(CORRUPT_KEY)).toBe('{not json')
    vi.restoreAllMocks()
  })
})
