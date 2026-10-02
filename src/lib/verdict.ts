/**
 * Plain-language readings of the engine's numbers: the verdict sentence, the
 * maths line, the "what would flip it" list, and share/export text. Pure.
 */
import {
  rankOptions,
  tallyProsCons,
  weightFlips,
  getScore,
  type DecisionModel,
  type StepFlip,
  type WeightedItem,
} from './engine'

export const f2 = (n: number) => n.toFixed(2)

export function optionLabel(model: Pick<DecisionModel, 'options'>, id: string): string {
  const i = model.options.findIndex((o) => o.id === id)
  if (i === -1) return 'Unknown option'
  return model.options[i].name.trim() || `Option ${i + 1}`
}

export function criterionLabel(model: Pick<DecisionModel, 'criteria'>, id: string): string {
  const i = model.criteria.findIndex((c) => c.id === id)
  if (i === -1) return 'Unknown'
  return model.criteria[i].name.trim() || `Criterion ${i + 1}`
}

/** A sentence in four parts so the UI can bold the head and colour the flag. */
export interface Sentence {
  head: string
  body: string
  flag: string
  tail: string
}

export const sentenceText = (s: Sentence) => [s.head + s.body, s.flag, s.tail.trim()].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

/** Effective raw weights: when every weight is 0 the engine splits evenly, so the board does too. */
export function effectiveWeights(model: DecisionModel): number[] {
  const ws = model.criteria.map((c) => (Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0))
  return ws.some((w) => w > 0) ? ws : ws.map(() => 1)
}

export const allWeightsZero = (model: DecisionModel) =>
  model.criteria.length > 0 && model.criteria.every((c) => !(c.weight > 0))

export function closeness(margin: number): 'too close' | 'close' | 'clear' {
  return margin < 0.25 ? 'too close' : margin < 0.6 ? 'close' : 'clear'
}

export function matrixVerdict(model: DecisionModel): Sentence {
  const s: Sentence = { head: '', body: '', flag: '', tail: '' }
  if (model.options.length === 0) return { ...s, head: 'Add the options you are choosing between.' }
  if (model.options.length < 2) return { ...s, head: 'Add a second option to compare.' }
  if (model.criteria.length === 0) return { ...s, head: 'Add what matters to you.', body: ' Each thing becomes a column as wide as its weight.' }
  const r = rankOptions(model)
  const zeroNote = allWeightsZero(model) ? ' Every weight is zero, so everything counts the same.' : ''
  if (r.isTie) {
    const names = r.winners.map((id) => optionLabel(model, id))
    const head = names.length === 2 ? `${names[0]} and ${names[1]} are tied` : `${names.length} options are tied`
    return { head, body: ` on ${f2(r.ranking[0].total)}.`, flag: 'Too close to call.', tail: ` Change a weight or a score to break it.${zeroNote}` }
  }
  const leader = optionLabel(model, r.winners[0])
  const runner = optionLabel(model, r.ranking[1].optionId)
  const c = closeness(r.margin)
  const flip = weightFlips(model, 1)[0]
  const why = flip
    ? ` Set ${criterionLabel(model, flip.criterionId)} to ${flip.to} and ${optionLabel(model, flip.newLeaderId)} wins.`
    : ' No single weight change flips it.'
  return {
    head: leader,
    body: ` leads ${runner} by ${f2(r.margin)}.${c === 'clear' ? ' A clear lead.' : ''}`,
    flag: c === 'too close' ? 'Too close to call.' : c === 'close' ? 'Close.' : '',
    tail: `${why}${zeroNote}`,
  }
}

/** "Harbour: (9x4 + 3x3) / 7 = 45 / 7 = 6.43" for the current leader (or first option). */
export function mathsLine(model: DecisionModel): string {
  if (model.options.length === 0 || model.criteria.length === 0) return ''
  const r = rankOptions(model)
  const id = r.ranking[0].optionId
  const ws = effectiveWeights(model)
  const W = ws.reduce((a, b) => a + b, 0)
  const parts = model.criteria.map((c, i) => `${getScore(model.scores, id, c.id)}x${ws[i]}`)
  const raw = model.criteria.reduce((a, c, i) => a + getScore(model.scores, id, c.id) * ws[i], 0)
  const rawStr = Number.isInteger(raw) ? String(raw) : f2(raw)
  return `${optionLabel(model, id)}: (${parts.join(' + ')}) / ${W} = ${rawStr} / ${W} = ${f2(r.ranking[0].total)}`
}

export interface FlipLine {
  flip: StepFlip
  criterion: string
  newLeader: string
}

export function flipLines(model: DecisionModel, limit = 3): FlipLine[] {
  return weightFlips(model, limit).map((flip) => ({
    flip,
    criterion: criterionLabel(model, flip.criterionId),
    newLeader: optionLabel(model, flip.newLeaderId),
  }))
}

export function quickVerdict(pros: WeightedItem[], cons: WeightedItem[]): Sentence {
  const { prosTotal: p, consTotal: c } = tallyProsCons(pros, cons)
  const s: Sentence = { head: '', body: '', flag: '', tail: '' }
  if (p === 0 && c === 0) return { ...s, head: 'Nothing on either side yet.', body: ' Add a reason for or against.' }
  if (p === c) return { ...s, head: `Even at ${p} each.`, body: ' A list will not settle this one.' }
  const close = Math.abs(p - c) / (p + c) < 0.15
  return {
    ...s,
    head: `${p > c ? 'Lean yes' : 'Lean no'}, ${Math.max(p, c)} to ${Math.min(p, c)}.`,
    flag: close ? 'Close:' : '',
    tail: close ? ' sleep on it.' : '',
  }
}

// ─── Share and export ────────────────────────────────────────────────────────

export function matrixShareText(title: string, model: DecisionModel): string {
  const r = rankOptions(model)
  const ws = effectiveWeights(model)
  const W = ws.reduce((a, b) => a + b, 0) || 1
  const lines = [`Big Decisions: ${title}`, `Verdict: ${sentenceText(matrixVerdict(model))}`, '', 'Ranking:']
  r.ranking.forEach((x) => lines.push(`${x.rank}. ${optionLabel(model, x.optionId)}  ${f2(x.total)} / 10`))
  lines.push('', 'What matters:')
  model.criteria.forEach((c, i) => lines.push(`- ${criterionLabel(model, c.id)}: weight ${c.weight} of 5 (${Math.round((ws[i] / W) * 100)}%)`))
  const fl = flipLines(model)
  if (fl.length) {
    lines.push('', 'What would flip it:')
    fl.forEach((f) => lines.push(`- ${f.criterion} weight ${f.flip.from} to ${f.flip.to} puts ${f.newLeader} first`))
  }
  return lines.join('\n')
}

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function matrixCsv(model: DecisionModel): string {
  const r = rankOptions(model)
  const head = ['Option', ...model.criteria.map((c) => `${criterionLabel(model, c.id)} (weight ${c.weight})`), 'Weighted total', 'Rank']
  const rows = model.options.map((o) => {
    const rk = r.ranking.find((x) => x.optionId === o.id)!
    return [optionLabel(model, o.id), ...model.criteria.map((c) => getScore(model.scores, o.id, c.id)), f2(rk.total), rk.rank]
  })
  return [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}

const LEVEL = ['', 'minor', 'moderate', 'major']

export function quickShareText(title: string, pros: WeightedItem[], cons: WeightedItem[]): string {
  const { prosTotal, consTotal } = tallyProsCons(pros, cons)
  return [
    `Big Decisions: ${title}`,
    `Verdict: ${sentenceText(quickVerdict(pros, cons))}`,
    '',
    'For:',
    ...pros.map((p) => `  + ${p.text} (${LEVEL[p.weight] ?? p.weight})`),
    '',
    'Against:',
    ...cons.map((c) => `  - ${c.text} (${LEVEL[c.weight] ?? c.weight})`),
    '',
    `Score: for ${prosTotal}, against ${consTotal}`,
  ].join('\n')
}

/** Safe file name from a title: "Which offer do I take?" -> "which-offer-do-i-take". */
export function fileSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'decision'
}
