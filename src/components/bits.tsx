import type { WeightedItem } from '../lib/engine'
import { tallyProsCons } from '../lib/engine'
import type { Sentence } from '../lib/verdict'

/** The one-sentence verdict: bold head, red flag, plain tail. */
export function Lede({ s, live = true, id }: { s: Sentence; live?: boolean; id?: string }) {
  return (
    <p className="lede" id={id} aria-live={live ? 'polite' : undefined}>
      <b>{s.head}</b>
      {s.body}
      {s.flag && (
        <>
          {' '}
          <em>{s.flag}</em>
        </>
      )}
      {s.tail}
    </p>
  )
}

/** For and Against as one bar against an even line. */
export function Tally({ pros, cons }: { pros: WeightedItem[]; cons: WeightedItem[] }) {
  const { prosTotal: p, consTotal: c } = tallyProsCons(pros, cons)
  return (
    <div className="tally" role="img" aria-label={`For ${p}, against ${c}`}>
      <div className="tbar">
        <span className="tp" style={{ flexGrow: p || 0.0001 }} />
        <span className="tc" style={{ flexGrow: c || 0.0001 }} />
      </div>
      <span className="tmid" />
      <div className="tkey mono" aria-hidden="true">
        <span>for {p}</span>
        <span>even</span>
        <span>against {c}</span>
      </div>
    </div>
  )
}

/** Weight blocks for a pros/cons item, read-only. */
export function WeightBlocks({ weight, against = false }: { weight: number; against?: boolean }) {
  const label = ['', 'Minor', 'Moderate', 'Major'][weight] ?? String(weight)
  return (
    <span className={`wblocks${against ? ' against' : ''}`}>
      {[1, 2, 3].map((n) => (
        <i key={n} className={n <= weight ? 'on' : ''} aria-hidden="true" />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  )
}
