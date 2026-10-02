import { describe, expect, it } from 'vitest'
import { exampleMatrix } from './example'
import type { DecisionModel } from './engine'
import { fileSlug, flipLines, mathsLine, matrixCsv, matrixShareText, matrixVerdict, quickShareText, quickVerdict, sentenceText } from './verdict'
import { scoreFromY, setScoreIn, setWeightIn } from './board'

const ex = (): DecisionModel => {
  const { options, criteria, scores } = exampleMatrix()
  return { options, criteria, scores }
}

describe('matrixVerdict', () => {
  it('names the leader, the margin, the closeness and the nearest flip', () => {
    const s = sentenceText(matrixVerdict(ex()))
    expect(s).toBe('Fieldnote leads Tidewater Studio by 0.37. Close. Set Location to 0 and Harbour Bank wins.')
  })
  it('handles the empty, single and no-criteria cases', () => {
    expect(matrixVerdict({ options: [], criteria: [], scores: {} }).head).toMatch(/Add the options/)
    expect(matrixVerdict({ options: [{ id: 'a', name: 'A' }], criteria: [], scores: {} }).head).toMatch(/second option/)
    expect(matrixVerdict({ options: [{ id: 'a', name: 'A' }, { id: 'b', name: '' }], criteria: [], scores: {} }).head).toMatch(/what matters/)
  })
  it('calls ties and notes all-zero weights', () => {
    const m: DecisionModel = {
      options: [{ id: 'a', name: 'A' }, { id: 'b', name: '' }],
      criteria: [{ id: 'x', name: 'X', weight: 0 }],
      scores: { a: { x: 5 }, b: { x: 5 } },
    }
    const v = matrixVerdict(m)
    expect(v.head).toBe('A and Option 2 are tied')
    expect(v.flag).toBe('Too close to call.')
    expect(v.tail).toMatch(/Every weight is zero/)
  })
  it('says a clear lead holds when nothing flips it', () => {
    const m: DecisionModel = {
      options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      criteria: [{ id: 'x', name: 'X', weight: 3 }],
      scores: { a: { x: 9 }, b: { x: 2 } },
    }
    expect(sentenceText(matrixVerdict(m))).toBe('A leads B by 7.00. A clear lead. No single weight change flips it.')
  })
})

describe('maths, flips and exports', () => {
  it('prints the leader sum', () => {
    expect(mathsLine(ex())).toBe('Fieldnote: (7x4 + 10x3 + 9x5 + 4x3 + 7x4) / 19 = 143 / 19 = 7.53')
  })
  it('lists up to three flips with names', () => {
    const fl = flipLines(ex())
    expect(fl.length).toBeGreaterThan(0)
    expect(fl.length).toBeLessThanOrEqual(3)
    expect(fl[0]).toMatchObject({ criterion: 'Location', newLeader: 'Harbour Bank' })
  })
  it('builds a share text and a quoted CSV', () => {
    const m = ex()
    m.options[0].name = 'Harbour, "the bank"'
    expect(matrixShareText('Jobs', m)).toContain('What would flip it:')
    const csv = matrixCsv(m).split('\n')
    expect(csv[0]).toBe('Option,Salary (weight 4),Location (weight 3),Growth (weight 5),Stability (weight 3),Team (weight 4),Weighted total,Rank')
    expect(csv[1]).toBe('"Harbour, ""the bank""",9,3,6,9,6,6.63,3')
  })
  it('quick verdicts and share text', () => {
    expect(sentenceText(quickVerdict([], []))).toBe('Nothing on either side yet. Add a reason for or against.')
    expect(sentenceText(quickVerdict([{ text: 'a', weight: 2 }], [{ text: 'b', weight: 2 }]))).toBe('Even at 2 each. A list will not settle this one.')
    expect(sentenceText(quickVerdict([{ text: 'a', weight: 3 }, { text: 'c', weight: 3 }, { text: 'd', weight: 1 }], [{ text: 'b', weight: 3 }, { text: 'e', weight: 3 }]))).toBe('Lean yes, 7 to 6. Close: sleep on it.')
    expect(quickShareText('T', [{ text: 'a', weight: 3 }], [])).toContain('  + a (major)')
  })
  it('slugs file names', () => {
    expect(fileSlug('Which offer do I take?')).toBe('which-offer-do-i-take')
    expect(fileSlug('???')).toBe('decision')
  })
})

describe('board helpers', () => {
  it('maps pointer height to a 0 to 10 score', () => {
    expect(scoreFromY(100, 80, 100)).toBe(10)
    expect(scoreFromY(100, 80, 180)).toBe(0)
    expect(scoreFromY(100, 80, 140)).toBe(5)
    expect(scoreFromY(100, 80, 40)).toBe(10)
    expect(scoreFromY(100, 80, 400)).toBe(0)
    expect(scoreFromY(100, 0, 120)).toBe(0)
  })
  it('clamps and rounds scores and weights without mutating', () => {
    const m = ex()
    const n = setScoreIn(m, 'harbour', 'sal', 12.4)
    expect(n.scores.harbour.sal).toBe(10)
    expect(m.scores.harbour.sal).toBe(9)
    expect(setWeightIn(m, 'gro', -3).criteria.find((c) => c.id === 'gro')!.weight).toBe(0)
    expect(setWeightIn(m, 'gro', 9).criteria.find((c) => c.id === 'gro')!.weight).toBe(5)
  })
})
