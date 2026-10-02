/**
 * Weighted decision engine (pure logic, no UI, no storage).
 *
 * Two modes share this module:
 *  - matrix: options x criteria, each criterion has a weight, each option has a
 *    score per criterion (SCORE_MIN..SCORE_MAX). Totals use normalised weights.
 *  - quick pros/cons: the original 1-3 weighted tally (`tallyProsCons`).
 */

export const SCORE_MIN = 0
export const SCORE_MAX = 10
/** Totals closer than this are treated as a tie (guards float noise). */
export const TIE_EPSILON = 1e-9

export interface Option {
  id: string
  name: string
}

export interface Criterion {
  id: string
  name: string
  /** Raw importance, >= 0. Only ratios matter; weights are normalised. */
  weight: number
}

/** scores[optionId][criterionId]. Missing entries count as SCORE_MIN. */
export type Scores = Record<string, Record<string, number>>

export interface DecisionModel {
  options: Option[]
  criteria: Criterion[]
  scores: Scores
}

export interface RankedOption {
  optionId: string
  /** Weighted total on the score scale (SCORE_MIN..SCORE_MAX). */
  total: number
  /** Total as 0-100 of the best attainable (all criteria scored SCORE_MAX). */
  percent: number
  /** Competition rank: tied options share a rank and the next rank skips (1,1,3). */
  rank: number
  tied: boolean
}

export interface Results {
  /** Criterion weights scaled to sum to 1 (equal split if all weights are 0). */
  normalisedWeights: Record<string, number>
  /** Sorted best first; ties keep input order. */
  ranking: RankedOption[]
  /** Every option sharing rank 1 (empty if there are no options). */
  winners: string[]
  isTie: boolean
  /** Gap between first and second place totals (0 when tied or < 2 options). */
  margin: number
}

export interface WeightFlip {
  criterionId: string
  /** Signed change to the raw weight that produces a tie with the rival. */
  delta: number
  newWeight: number
  /** delta / current weight; null when the current weight is 0. */
  relativeChange: number | null
  /** Option that would take over (tie) at that weight. */
  rivalId: string
}

export interface Sensitivity {
  /** Current sole leader, or null when tied or fewer than 2 options. */
  leaderId: string | null
  /** Per criterion, the smallest weight change that flips the leader. Criteria that cannot flip are omitted. */
  flips: WeightFlip[]
  /** The flip needing the least change (by relativeChange, then |delta|). */
  mostSensitive: WeightFlip | null
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return SCORE_MIN
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, n))
}

export function getScore(scores: Scores, optionId: string, criterionId: string): number {
  return clampScore(scores[optionId]?.[criterionId] ?? SCORE_MIN)
}

function safeWeight(w: number): number {
  return Number.isFinite(w) && w > 0 ? w : 0
}

export function normaliseWeights(criteria: Criterion[]): Record<string, number> {
  const out: Record<string, number> = {}
  const total = criteria.reduce((s, c) => s + safeWeight(c.weight), 0)
  for (const c of criteria) {
    out[c.id] = total > 0 ? safeWeight(c.weight) / total : criteria.length > 0 ? 1 / criteria.length : 0
  }
  return out
}

export function weightedTotal(model: DecisionModel, optionId: string): number {
  const nw = normaliseWeights(model.criteria)
  return model.criteria.reduce((s, c) => s + nw[c.id] * getScore(model.scores, optionId, c.id), 0)
}

export function rankOptions(model: DecisionModel): Results {
  const nw = normaliseWeights(model.criteria)
  const rows = model.options.map((o, index) => ({
    optionId: o.id,
    index,
    total: model.criteria.reduce((s, c) => s + nw[c.id] * getScore(model.scores, o.id, c.id), 0),
  }))
  rows.sort((a, b) => (Math.abs(b.total - a.total) < TIE_EPSILON ? a.index - b.index : b.total - a.total))

  const range = SCORE_MAX - SCORE_MIN
  const ranking: RankedOption[] = []
  rows.forEach((r, i) => {
    const prev = ranking[i - 1]
    const rank = prev && Math.abs(prev.total - r.total) < TIE_EPSILON ? prev.rank : i + 1
    ranking.push({
      optionId: r.optionId,
      total: r.total,
      percent: range > 0 ? ((r.total - SCORE_MIN) / range) * 100 : 0,
      rank,
      tied: false,
    })
  })
  for (const r of ranking) r.tied = ranking.filter((x) => x.rank === r.rank).length > 1

  const winners = ranking.filter((r) => r.rank === 1).map((r) => r.optionId)
  const margin = ranking.length >= 2 ? Math.max(0, ranking[0].total - ranking[1].total) : 0
  return {
    normalisedWeights: nw,
    ranking,
    winners,
    isTie: winners.length > 1,
    margin: winners.length > 1 ? 0 : margin,
  }
}

/**
 * For each criterion: how far its raw weight must move (others fixed) for the
 * sole leader to be matched by a rival. Exact, not sampled.
 *
 * With raw weights w, T = sum(w): option total = sum(w_i s_i) / T. For leader L
 * and rival R, D = sum(w_i (sL_i - sR_i)) > 0, d = sL_c - sR_c. Moving w_c by
 * delta gives numerator D + delta*d (denominator stays positive), which hits
 * zero at delta = -D/d. Feasible only if the new weight stays >= 0.
 */
export function sensitivity(model: DecisionModel): Sensitivity {
  const results = rankOptions(model)
  if (model.options.length < 2 || results.isTie) {
    return { leaderId: null, flips: [], mostSensitive: null }
  }
  const leaderId = results.winners[0]
  const w: Record<string, number> = {}
  for (const c of model.criteria) w[c.id] = safeWeight(c.weight)
  // Equal-split fallback mirrors normaliseWeights when every weight is 0.
  if (model.criteria.every((c) => w[c.id] === 0)) for (const c of model.criteria) w[c.id] = 1

  const rivals = model.options.filter((o) => o.id !== leaderId)
  const flips: WeightFlip[] = []

  for (const c of model.criteria) {
    let best: WeightFlip | null = null
    for (const r of rivals) {
      const D = model.criteria.reduce(
        (s, k) => s + w[k.id] * (getScore(model.scores, leaderId, k.id) - getScore(model.scores, r.id, k.id)),
        0,
      )
      const d = getScore(model.scores, leaderId, c.id) - getScore(model.scores, r.id, c.id)
      if (D <= 0 || d === 0) continue
      const delta = -D / d
      if (w[c.id] + delta < -TIE_EPSILON) continue
      const cand: WeightFlip = {
        criterionId: c.id,
        delta,
        newWeight: Math.max(0, w[c.id] + delta),
        relativeChange: w[c.id] > 0 ? delta / w[c.id] : null,
        rivalId: r.id,
      }
      if (!best || Math.abs(cand.delta) < Math.abs(best.delta)) best = cand
    }
    if (best) flips.push(best)
  }

  const key = (f: WeightFlip) => (f.relativeChange === null ? Infinity : Math.abs(f.relativeChange))
  const mostSensitive =
    [...flips].sort((a, b) => key(a) - key(b) || Math.abs(a.delta) - Math.abs(b.delta))[0] ?? null
  return { leaderId, flips, mostSensitive }
}

// ─── Quick pros/cons mode ────────────────────────────────────────────────────

export type ProsConsWeight = 1 | 2 | 3
export type Verdict = 'lean yes' | 'lean no' | 'too close to call'

export interface WeightedItem {
  text: string
  weight: number
}

export interface Tally {
  prosTotal: number
  consTotal: number
  verdict: Verdict
}

/** The original tally: sum of pro weights vs sum of con weights. */
export function tallyProsCons(pros: WeightedItem[] = [], cons: WeightedItem[] = []): Tally {
  const prosTotal = pros.reduce((s, p) => s + p.weight, 0)
  const consTotal = cons.reduce((s, c) => s + c.weight, 0)
  const verdict: Verdict =
    prosTotal > consTotal ? 'lean yes' : consTotal > prosTotal ? 'lean no' : 'too close to call'
  return { prosTotal, consTotal, verdict }
}

/** Express a pros/cons list as a two-option matrix ("Do it" vs "Don't"), so the same engine can score it. */
export function prosConsToModel(pros: WeightedItem[], cons: WeightedItem[]): DecisionModel {
  const criteria: Criterion[] = []
  const yes: Record<string, number> = {}
  const no: Record<string, number> = {}
  pros.forEach((p, i) => {
    const id = `pro-${i}`
    criteria.push({ id, name: p.text, weight: p.weight })
    yes[id] = SCORE_MAX
    no[id] = SCORE_MIN
  })
  cons.forEach((c, i) => {
    const id = `con-${i}`
    criteria.push({ id, name: c.text, weight: c.weight })
    yes[id] = SCORE_MIN
    no[id] = SCORE_MAX
  })
  return {
    options: [
      { id: 'yes', name: 'Do it' },
      { id: 'no', name: "Don't" },
    ],
    criteria,
    scores: { yes, no },
  }
}
