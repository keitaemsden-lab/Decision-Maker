import { describe, expect, it } from 'vitest'
import {
  SCORE_MAX,
  clampScore,
  normaliseWeights,
  prosConsToModel,
  rankOptions,
  sensitivity,
  tallyProsCons,
  weightedTotal,
  type DecisionModel,
} from './engine'

const model = (over: Partial<DecisionModel> = {}): DecisionModel => ({
  options: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  criteria: [
    { id: 'price', name: 'Price', weight: 3 },
    { id: 'speed', name: 'Speed', weight: 1 },
  ],
  scores: {
    a: { price: 8, speed: 4 },
    b: { price: 5, speed: 10 },
  },
  ...over,
})

describe('normaliseWeights', () => {
  it('scales to sum 1', () => {
    const n = normaliseWeights(model().criteria)
    expect(n.price).toBeCloseTo(0.75)
    expect(n.speed).toBeCloseTo(0.25)
  })
  it('splits equally when all weights are zero', () => {
    const n = normaliseWeights([
      { id: 'x', name: 'x', weight: 0 },
      { id: 'y', name: 'y', weight: 0 },
    ])
    expect(n).toEqual({ x: 0.5, y: 0.5 })
  })
  it('treats negative, NaN and Infinity weights as 0', () => {
    const n = normaliseWeights([
      { id: 'x', name: 'x', weight: -5 },
      { id: 'y', name: 'y', weight: NaN },
      { id: 'z', name: 'z', weight: 2 },
    ])
    expect(n).toEqual({ x: 0, y: 0, z: 1 })
  })
  it('handles no criteria', () => {
    expect(normaliseWeights([])).toEqual({})
  })
  it('is invariant to scaling all weights', () => {
    const n1 = normaliseWeights([{ id: 'a', name: '', weight: 1 }, { id: 'b', name: '', weight: 3 }])
    const n2 = normaliseWeights([{ id: 'a', name: '', weight: 10 }, { id: 'b', name: '', weight: 30 }])
    expect(n1.a).toBeCloseTo(n2.a)
  })
})

describe('totals and ranking', () => {
  it('computes normalised weighted totals', () => {
    expect(weightedTotal(model(), 'a')).toBeCloseTo(0.75 * 8 + 0.25 * 4) // 7
    expect(weightedTotal(model(), 'b')).toBeCloseTo(0.75 * 5 + 0.25 * 10) // 6.25
  })
  it('ranks best first with percent of max', () => {
    const r = rankOptions(model())
    expect(r.ranking.map((x) => x.optionId)).toEqual(['a', 'b'])
    expect(r.ranking[0].rank).toBe(1)
    expect(r.ranking[1].rank).toBe(2)
    expect(r.ranking[0].percent).toBeCloseTo(70)
    expect(r.winners).toEqual(['a'])
    expect(r.isTie).toBe(false)
    expect(r.margin).toBeCloseTo(0.75)
  })
  it('missing scores count as zero and out-of-range scores are clamped', () => {
    const m = model({ scores: { a: { price: 99 }, b: { price: -4, speed: 10 } } })
    expect(weightedTotal(m, 'a')).toBeCloseTo(0.75 * SCORE_MAX)
    expect(weightedTotal(m, 'b')).toBeCloseTo(0.25 * 10)
    expect(clampScore(NaN)).toBe(0)
  })
  it('detects a tie, shares rank 1 and keeps input order', () => {
    const m = model({ scores: { a: { price: 5, speed: 5 }, b: { price: 5, speed: 5 } } })
    const r = rankOptions(m)
    expect(r.isTie).toBe(true)
    expect(r.winners).toEqual(['a', 'b'])
    expect(r.ranking.every((x) => x.rank === 1 && x.tied)).toBe(true)
    expect(r.margin).toBe(0)
  })
  it('ties within float noise count as ties', () => {
    const m = model({
      criteria: [
        { id: 'p', name: '', weight: 0.1 },
        { id: 'q', name: '', weight: 0.2 },
      ],
      scores: { a: { p: 3, q: 0 }, b: { p: 0, q: 1.5 } },
    })
    // 0.1*3 = 0.3 and 0.2*1.5 = 0.3 differ by float error only
    expect(rankOptions(m).isTie).toBe(true)
  })
  it('uses competition ranking for a partial tie (1,1,3)', () => {
    const m: DecisionModel = {
      options: [
        { id: 'a', name: '' },
        { id: 'b', name: '' },
        { id: 'c', name: '' },
      ],
      criteria: [{ id: 'k', name: '', weight: 1 }],
      scores: { a: { k: 7 }, b: { k: 7 }, c: { k: 2 } },
    }
    const r = rankOptions(m)
    expect(r.ranking.map((x) => x.rank)).toEqual([1, 1, 3])
    expect(r.ranking.map((x) => x.tied)).toEqual([true, true, false])
  })
  it('handles empty and single-option models', () => {
    expect(rankOptions({ options: [], criteria: [], scores: {} })).toMatchObject({ winners: [], isTie: false })
    const one = rankOptions(model({ options: [{ id: 'a', name: 'A' }] }))
    expect(one.winners).toEqual(['a'])
    expect(one.margin).toBe(0)
  })
  it('handles options with no criteria (all zero, all tied)', () => {
    const r = rankOptions(model({ criteria: [] }))
    expect(r.isTie).toBe(true)
  })
})

describe('sensitivity', () => {
  it('finds the exact weight at which the leader is matched', () => {
    // a: 8p+4s, b: 5p+10s ; weights p=3,s=1. D = 3*3 + 1*(-6) = 3.
    // Raise speed: d=-6 -> delta = 3/6 = 0.5 -> speed 1.5. Lower price: d=3 -> delta=-1 -> price 2.
    const s = sensitivity(model())
    expect(s.leaderId).toBe('a')
    const speed = s.flips.find((f) => f.criterionId === 'speed')!
    expect(speed.delta).toBeCloseTo(0.5)
    expect(speed.newWeight).toBeCloseTo(1.5)
    expect(speed.relativeChange).toBeCloseTo(0.5)
    expect(speed.rivalId).toBe('b')
    const price = s.flips.find((f) => f.criterionId === 'price')!
    expect(price.delta).toBeCloseTo(-1)
    expect(price.newWeight).toBeCloseTo(2)
  })
  it('the reported weight really produces a tie, and a bit past it flips the winner', () => {
    const m = model()
    const f = sensitivity(m).flips.find((x) => x.criterionId === 'speed')!
    const at = (w: number) => ({
      ...m,
      criteria: m.criteria.map((c) => (c.id === 'speed' ? { ...c, weight: w } : c)),
    })
    expect(rankOptions(at(f.newWeight)).isTie).toBe(true)
    expect(rankOptions(at(f.newWeight + 0.01)).winners).toEqual(['b'])
    expect(rankOptions(at(f.newWeight - 0.01)).winners).toEqual(['a'])
  })
  it('picks the most sensitive criterion by relative change', () => {
    const s = sensitivity(model())
    // speed +50% vs price -33%: price is the more sensitive one
    expect(s.mostSensitive?.criterionId).toBe('price')
  })
  it('omits criteria that cannot flip the result', () => {
    // a beats b on every criterion: no weight change can ever flip it
    const m = model({ scores: { a: { price: 9, speed: 9 }, b: { price: 1, speed: 1 } } })
    const s = sensitivity(m)
    expect(s.leaderId).toBe('a')
    expect(s.flips).toEqual([])
    expect(s.mostSensitive).toBeNull()
  })
  it('omits a downward flip that would need a negative weight', () => {
    // lowering price would need weight < 0 to tip it; only raising speed works
    const m = model({ scores: { a: { price: 6, speed: 4 }, b: { price: 5, speed: 10 } } })
    // D = 3*1 + 1*(-6) = -3 -> b leads, so use b as leader instead
    const s = sensitivity(m)
    expect(s.leaderId).toBe('b')
    const price = s.flips.find((f) => f.criterionId === 'price')
    // b leads on speed only; raising price from 3 to 6 ties it
    expect(price?.newWeight).toBeCloseTo(6)
    expect(s.flips.every((f) => f.newWeight >= 0)).toBe(true)
  })
  it('chooses the closest rival across several options', () => {
    const m: DecisionModel = {
      options: [
        { id: 'a', name: '' },
        { id: 'b', name: '' },
        { id: 'c', name: '' },
      ],
      criteria: [
        { id: 'x', name: '', weight: 1 },
        { id: 'y', name: '', weight: 1 },
      ],
      scores: { a: { x: 8, y: 6 }, b: { x: 4, y: 9 }, c: { x: 7, y: 5 } },
    }
    const s = sensitivity(m)
    expect(s.leaderId).toBe('a')
    const y = s.flips.find((f) => f.criterionId === 'y')!
    // vs b: D=4+(-3)=1, d=-3 -> delta .333 ; vs c: d=1 -> delta=-D(=1+... )
    expect(y.rivalId).toBe('b')
    expect(y.delta).toBeCloseTo(1 / 3)
  })
  it('returns nothing on a tie or with fewer than two options', () => {
    const tie = sensitivity(model({ scores: { a: { price: 5, speed: 5 }, b: { price: 5, speed: 5 } } }))
    expect(tie).toEqual({ leaderId: null, flips: [], mostSensitive: null })
    expect(sensitivity(model({ options: [{ id: 'a', name: '' }] })).leaderId).toBeNull()
  })
  it('reports relativeChange null for a zero-weight criterion', () => {
    const m = model({
      criteria: [
        { id: 'price', name: '', weight: 1 },
        { id: 'speed', name: '', weight: 0 },
      ],
    })
    const f = sensitivity(m).flips.find((x) => x.criterionId === 'speed')!
    expect(f.relativeChange).toBeNull()
    expect(f.newWeight).toBeGreaterThan(0)
  })
})

describe('quick pros/cons mode', () => {
  it('tallies weights into a verdict', () => {
    expect(tallyProsCons([{ text: 'a', weight: 3 }, { text: 'b', weight: 1 }], [{ text: 'c', weight: 3 }])).toEqual({
      prosTotal: 4,
      consTotal: 3,
      verdict: 'lean yes',
    })
    expect(tallyProsCons([{ text: 'a', weight: 1 }], [{ text: 'c', weight: 2 }]).verdict).toBe('lean no')
    expect(tallyProsCons([{ text: 'a', weight: 2 }], [{ text: 'c', weight: 2 }]).verdict).toBe('too close to call')
    expect(tallyProsCons().verdict).toBe('too close to call')
  })
  it('agrees with the matrix engine on the winner', () => {
    const pros = [{ text: 'p1', weight: 3 }, { text: 'p2', weight: 1 }]
    const cons = [{ text: 'c1', weight: 2 }]
    const r = rankOptions(prosConsToModel(pros, cons))
    expect(r.winners).toEqual(['yes'])
    const r2 = rankOptions(prosConsToModel(cons, pros))
    expect(r2.winners).toEqual(['no'])
    expect(rankOptions(prosConsToModel([{ text: 'a', weight: 2 }], [{ text: 'b', weight: 2 }])).isTie).toBe(true)
  })
})
