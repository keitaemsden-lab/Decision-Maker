import {
  SCORE_MAX,
  SCORE_MIN,
  tallyProsCons,
  type Criterion,
  type Option,
  type Scores,
  type Verdict,
} from '../lib/engine'

// ─── Schema ──────────────────────────────────────────────────────────────────
//
// v1 (legacy, unversioned): the `decisions` key held a bare array of
//   { id, title, pros, cons, createdAt, recommendation } objects.
// v2: the `decisions` key holds { version: 2, decisions: Decision[] }, and each
//   decision has a `mode`: 'proscons' (v1 shape) or 'matrix' (options x criteria).

export const STORAGE_KEY = 'decisions'
export const BACKUP_KEY = 'decisions.v1.backup'
export const CORRUPT_KEY = 'decisions.corrupt'
export const SCHEMA_VERSION = 2

export interface ProsConsItem {
  id: string
  text: string
  weight: number
}

interface BaseDecision {
  id: string
  title: string
  createdAt: string
}

export interface ProsConsDecision extends BaseDecision {
  mode: 'proscons'
  pros: ProsConsItem[]
  cons: ProsConsItem[]
  recommendation: Verdict
}

export interface MatrixDecision extends BaseDecision {
  mode: 'matrix'
  options: Option[]
  criteria: Criterion[]
  scores: Scores
}

export type Decision = ProsConsDecision | MatrixDecision

export interface StoredData {
  version: number
  decisions: Decision[]
}

// ─── Recommendation logic (kept for existing callers) ───────────────────────

export function calculateRecommendation(
  pros: { weight: number }[] = [],
  cons: { weight: number }[] = [],
): Verdict {
  return tallyProsCons(
    pros as { text: string; weight: number }[],
    cons as { text: string; weight: number }[],
  ).verdict
}

// ─── Migration ───────────────────────────────────────────────────────────────

function newId(): string {
  return globalThis.crypto.randomUUID()
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function str(x: unknown, fallback = ''): string {
  return typeof x === 'string' ? x : fallback
}

function validDate(x: unknown): string {
  if (typeof x === 'string' && !Number.isNaN(Date.parse(x))) return x
  return new Date(0).toISOString()
}

function migrateItems(raw: unknown): ProsConsItem[] {
  if (!Array.isArray(raw)) return []
  const out: ProsConsItem[] = []
  for (const it of raw) {
    if (!isObj(it)) continue
    const text = str(it.text).trim()
    if (!text) continue
    const w = Math.round(Number(it.weight))
    out.push({
      id: str(it.id) || newId(),
      text,
      weight: Number.isFinite(w) ? Math.min(3, Math.max(1, w)) : 1,
    })
  }
  return out
}

function migrateScores(raw: unknown): Scores {
  const out: Scores = {}
  if (!isObj(raw)) return out
  for (const [oid, row] of Object.entries(raw)) {
    if (!isObj(row)) continue
    out[oid] = {}
    for (const [cid, v] of Object.entries(row)) {
      const n = Number(v)
      out[oid][cid] = Number.isFinite(n) ? Math.min(SCORE_MAX, Math.max(SCORE_MIN, n)) : SCORE_MIN
    }
  }
  return out
}

/** Normalise one stored decision (any version) to the current shape. Returns null if unusable. */
export function migrateDecision(raw: unknown): Decision | null {
  if (!isObj(raw)) return null
  const base = {
    id: str(raw.id) || newId(),
    title: str(raw.title).trim() || 'Untitled decision',
    createdAt: validDate(raw.createdAt),
  }
  if (raw.mode === 'matrix') {
    const options = Array.isArray(raw.options)
      ? raw.options.filter(isObj).map((o) => ({ id: str(o.id) || newId(), name: str(o.name) }))
      : []
    const criteria = Array.isArray(raw.criteria)
      ? raw.criteria.filter(isObj).map((c) => {
          const w = Number(c.weight)
          return { id: str(c.id) || newId(), name: str(c.name), weight: Number.isFinite(w) && w > 0 ? w : 0 }
        })
      : []
    return { ...base, mode: 'matrix', options, criteria, scores: migrateScores(raw.scores) }
  }
  // v1 shape, or v2 'proscons'
  const pros = migrateItems(raw.pros)
  const cons = migrateItems(raw.cons)
  return { ...base, mode: 'proscons', pros, cons, recommendation: calculateRecommendation(pros, cons) }
}

/** Accepts v1 (bare array), v2 envelope, or garbage. Always returns current-version data with unique ids. */
export function migrateStored(raw: unknown): StoredData {
  let list: unknown[] = []
  if (Array.isArray(raw)) list = raw
  else if (isObj(raw) && Array.isArray(raw.decisions)) list = raw.decisions

  const seen = new Set<string>()
  const decisions: Decision[] = []
  for (const item of list) {
    const d = migrateDecision(item)
    if (!d) continue
    // Legacy Date.now() ids could collide; keep the first, re-id the rest.
    if (seen.has(d.id)) d.id = newId()
    seen.add(d.id)
    decisions.push(d)
  }
  return { version: SCHEMA_VERSION, decisions }
}

// ─── CRUD helpers ────────────────────────────────────────────────────────────

/** Load all decisions, migrating (and persisting) legacy data on first read. */
export function loadDecisions(): Decision[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    const isCurrent = isObj(parsed) && parsed.version === SCHEMA_VERSION && Array.isArray(parsed.decisions)
    const data = migrateStored(parsed)
    if (!isCurrent) {
      try {
        // Keep the untouched original so a bad migration is recoverable by hand.
        if (localStorage.getItem(BACKUP_KEY) === null) localStorage.setItem(BACKUP_KEY, raw)
        persist(data.decisions)
      } catch {
        /* storage full or blocked: still return migrated data in memory */
      }
    }
    return data.decisions
  } catch {
    console.error('Failed to load decisions from localStorage')
    try {
      if (raw !== null) localStorage.setItem(CORRUPT_KEY, raw)
    } catch {
      /* ignore */
    }
    return []
  }
}

function persist(decisions: Decision[]): void {
  const data: StoredData = { version: SCHEMA_VERSION, decisions }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function saveDecision({
  title,
  pros = [],
  cons = [],
}: {
  title: string
  pros?: { id?: string; text: string; weight: number }[]
  cons?: { id?: string; text: string; weight: number }[]
}): ProsConsDecision {
  const withIds = (xs: typeof pros): ProsConsItem[] => xs.map((x) => ({ ...x, id: x.id ?? newId() }))
  const p = withIds(pros)
  const c = withIds(cons)
  const decision: ProsConsDecision = {
    id: newId(),
    title,
    mode: 'proscons',
    pros: p,
    cons: c,
    createdAt: new Date().toISOString(),
    recommendation: calculateRecommendation(p, c),
  }
  persist([...loadDecisions(), decision])
  return decision
}

/** Save a fully-formed matrix decision (for the upcoming engine UI). */
export function saveMatrixDecision(input: {
  title: string
  options: Option[]
  criteria: Criterion[]
  scores: Scores
}): MatrixDecision {
  const decision: MatrixDecision = {
    id: newId(),
    mode: 'matrix',
    createdAt: new Date().toISOString(),
    ...input,
  }
  persist([...loadDecisions(), decision])
  return decision
}

export function getDecisionById(id: string): Decision | undefined {
  return loadDecisions().find((d) => d.id === id)
}

export function deleteDecision(id: string): boolean {
  const decisions = loadDecisions()
  const filtered = decisions.filter((d) => d.id !== id)
  if (filtered.length === decisions.length) return false
  persist(filtered)
  return true
}

export function updateDecision(id: string, updates: Partial<Decision>): Decision | null {
  const decisions = loadDecisions()
  const index = decisions.findIndex((d) => d.id === id)
  if (index === -1) return null
  const merged = { ...decisions[index], ...updates, id } as Decision
  if (merged.mode === 'proscons') merged.recommendation = calculateRecommendation(merged.pros, merged.cons)
  decisions[index] = merged
  persist(decisions)
  return merged
}
