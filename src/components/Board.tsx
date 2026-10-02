import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { SCORE_MAX, SCORE_MIN, WEIGHT_MAX, WEIGHT_MIN, getScore, rankOptions, type DecisionModel } from '../lib/engine'
import { scoreFromY, setScoreIn, setWeightIn } from '../lib/board'
import { criterionLabel, effectiveWeights, f2, flipLines, mathsLine, optionLabel } from '../lib/verdict'
import { useReducedMotion } from './useReducedMotion'

const EXPO = 'cubic-bezier(0.16, 1, 0.30, 1)'
/** expo-out, matches cubic-bezier(0.16, 1, 0.30, 1) closely enough for a width tween */
const easeOut = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))
const colsFor = (ws: number[]) => ws.map((w) => `minmax(${Math.min(14, w * 14)}px, ${w.toFixed(4)}fr)`).join(' ')

const KEY_STEP: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 2, PageDown: -2 }

interface BoardProps {
  model: DecisionModel
  onChange: (m: DecisionModel) => void
  /** Optional reset control in the What matters header (for example "Undo changes"). */
  reset?: { label: string; onClick: () => void } | null
  /** Prefix for ids, so two boards never collide. */
  idPrefix?: string
}

export default function Board({ model, onChange, reset, idPrefix = 'b' }: BoardProps) {
  const reduced = useReducedMotion()
  const results = useMemo(() => rankOptions(model), [model])
  const ws = effectiveWeights(model)
  const W = ws.reduce((a, b) => a + b, 0)
  const soleLeader = results.isTie ? null : results.winners[0] ?? null

  // Rows freeze their order while a block is being dragged, then settle on release.
  const [frozen, setFrozen] = useState<string[] | null>(null)
  const liveOrder = results.ranking.map((r) => r.optionId)
  const order = frozen && frozen.length === liveOrder.length && frozen.every((id) => liveOrder.includes(id)) ? frozen : liveOrder
  const rankOf = new Map(results.ranking.map((r) => [r.optionId, r]))

  const mosaicRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLSpanElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const prevTops = useRef(new Map<string, number>())
  const lastOrder = useRef('')
  const refocus = useRef<string | null>(null)
  const drag = useRef<{ o: string; c: string; touch: boolean } | null>(null)

  // Header labels need the real column width.
  const [cellsWidth, setCellsWidth] = useState(600)
  useEffect(() => {
    const el = headRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setCellsWidth(e.contentRect.width || 600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Signature gesture: column widths tween to the new weights (grid fr tracks do not interpolate in CSS).
  const shown = useRef<number[] | null>(null)
  const raf = useRef(0)
  const wsKey = ws.join(',')
  useLayoutEffect(() => {
    const el = mosaicRef.current
    if (!el) return
    const to = wsKey ? wsKey.split(',').map(Number) : []
    cancelAnimationFrame(raf.current)
    const from = shown.current
    if (reduced || !from || from.length !== to.length) {
      shown.current = to
      el.style.setProperty('--cols', colsFor(to))
      return
    }
    const t0 = performance.now()
    const step = (now: number) => {
      const k = easeOut(Math.min(1, (now - t0) / 700))
      const cur = from.map((f, i) => f + (to[i] - f) * k)
      shown.current = cur
      el.style.setProperty('--cols', colsFor(cur))
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }, [wsKey, reduced])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // Rows re-sort into rank order with a FLIP slide; focus follows the block being scored.
  const orderKey = order.join('|')
  useLayoutEffect(() => {
    const changed = orderKey !== lastOrder.current
    rowRefs.current.forEach((el, id) => {
      const top = el.offsetTop
      const prev = prevTops.current.get(id)
      if (changed && !reduced && prev !== undefined && prev !== top && typeof el.animate === 'function') {
        el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'none' }], { duration: 700, easing: EXPO })
      }
      prevTops.current.set(id, top)
    })
    lastOrder.current = orderKey
    if (refocus.current) {
      const cell = mosaicRef.current?.querySelector<HTMLElement>(`[data-key="${refocus.current}"]`)
      if (cell && document.activeElement !== cell) cell.focus({ preventScroll: true })
      refocus.current = null
    }
  })

  const setScore = (o: string, c: string, v: number) => {
    if (getScore(model.scores, o, c) === Math.round(Math.min(SCORE_MAX, Math.max(SCORE_MIN, v)))) return
    onChange(setScoreIn(model, o, c, v))
  }

  const cellAt = (target: EventTarget) => (target as HTMLElement).closest<HTMLElement>('.cell')
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const cell = cellAt(e.target)
    if (!cell || e.button > 0) return
    const { o, c } = cell.dataset as { o: string; c: string }
    drag.current = { o, c, touch: e.pointerType === 'touch' }
    if (!drag.current.touch) {
      e.preventDefault()
      cell.focus({ preventScroll: true })
      cell.setPointerCapture?.(e.pointerId)
      setFrozen(liveOrder)
      const b = cell.getBoundingClientRect()
      setScore(o, c, scoreFromY(b.top, b.height, e.clientY))
    }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.touch) return
    const cell = mosaicRef.current?.querySelector<HTMLElement>(`[data-key="${d.o}:${d.c}"]`)
    if (!cell) return
    const b = cell.getBoundingClientRect()
    setScore(d.o, d.c, scoreFromY(b.top, b.height, e.clientY))
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>, apply: boolean) => {
    const d = drag.current
    if (d && d.touch && apply) {
      // A tap sets the score; a swipe is left to scroll the page.
      const cell = cellAt(e.target)
      if (cell && cell.dataset.o === d.o && cell.dataset.c === d.c) {
        const b = cell.getBoundingClientRect()
        setScore(d.o, d.c, scoreFromY(b.top, b.height, e.clientY))
      }
    }
    drag.current = null
    setFrozen(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cell = cellAt(e.target)
    if (!cell) return
    const { o, c } = cell.dataset as { o: string; c: string }
    const cur = getScore(model.scores, o, c)
    let next: number | null = null
    if (e.key in KEY_STEP) next = cur + KEY_STEP[e.key]
    else if (e.key === 'Home') next = SCORE_MIN
    else if (e.key === 'End') next = SCORE_MAX
    else if (/^[0-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) next = Number(e.key)
    if (next === null) return
    e.preventDefault()
    refocus.current = `${o}:${c}`
    setScore(o, c, next)
  }

  const flips = flipLines(model)
  const maths = mathsLine(model)
  const ready = model.options.length > 0 && model.criteria.length > 0

  return (
    <div className="layout">
      <section className="board" aria-labelledby={`${idPrefix}-result`}>
        <div className="board-head">
          <h2 id={`${idPrefix}-result`}>Weighted result</h2>
          <p className="hint">Column width is the weight. Fill is the score. Drag a block up or down, or focus it and use the arrow keys or type 0 to 9.</p>
        </div>
        {ready ? (
          <div
            className="mosaic"
            ref={mosaicRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endDrag(e, true)}
            onPointerCancel={(e) => endDrag(e, false)}
            onKeyDown={onKeyDown}
          >
            <div className="mrow mhead" aria-hidden="true">
              <span className="mlab" />
              <span className="mcells" ref={headRef}>
                {model.criteria.map((c, i) => {
                  const px = W ? (ws[i] / W) * (cellsWidth - 3 * (model.criteria.length - 1)) : 0
                  const name = criterionLabel(model, c.id)
                  const pct = W ? Math.round((ws[i] / W) * 100) : 0
                  return (
                    <span key={c.id} className={ws[i] ? '' : 'off'}>
                      {px > 92 ? `${name} ${pct}%` : px > 34 ? name.slice(0, 3) : ''}
                    </span>
                  )
                })}
              </span>
              <span className="mtot">/10</span>
            </div>
            {order.map((oid) => {
              const r = rankOf.get(oid)!
              const lead = oid === soleLeader
              const name = optionLabel(model, oid)
              return (
                <div
                  key={oid}
                  className={`mrow${lead ? ' lead' : ''}`}
                  ref={(el) => {
                    if (el) rowRefs.current.set(oid, el)
                    else rowRefs.current.delete(oid)
                  }}
                >
                  <div className="mlab">
                    <span className="mrank">
                      {String(r.rank).padStart(2, '0')}
                      {r.tied ? ' tied' : ''}
                    </span>
                    <span className="mname">{name}</span>
                  </div>
                  <div className="mcells">
                    {model.criteria.map((c, ci) => {
                      const s = getScore(model.scores, oid, c.id)
                      const px = W ? (ws[ci] / W) * cellsWidth : 0
                      const off = !ws[ci]
                      return (
                        <div
                          key={c.id}
                          className={`cell${s <= 3 ? ' lo' : ''}${off ? ' off' : ''}${px < 30 ? ' thin' : ''}`}
                          data-o={oid}
                          data-c={c.id}
                          data-key={`${oid}:${c.id}`}
                          tabIndex={off ? -1 : 0}
                          role="slider"
                          aria-label={`${name}, ${criterionLabel(model, c.id)} score out of 10`}
                          aria-valuemin={SCORE_MIN}
                          aria-valuemax={SCORE_MAX}
                          aria-valuenow={s}
                          aria-valuetext={`${s} of 10, weight ${c.weight}`}
                        >
                          <i style={{ transform: `scaleY(${s / SCORE_MAX})` }} />
                          <b>{s}</b>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mtot">
                    {f2(r.total)}
                    <span className="sr-only"> out of 10</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="empty-board">The board appears once there is at least one option and one thing that matters.</p>
        )}
        {ready && <p className="sum mono">{maths}</p>}

        {ready && model.options.length > 1 && (
          <div className="flips">
            <h3>What would flip it</h3>
            <ul>
              {results.isTie ? (
                <li>Tied, so there is nothing to flip yet. Change a weight or a score to break it.</li>
              ) : flips.length ? (
                flips.map((f) => (
                  <li key={f.flip.criterionId}>
                    {f.criterion} weight {f.flip.from} to {f.flip.to} puts <b>{f.newLeader}</b> first{' '}
                    <span className="mono">{f2(f.flip.newTotal)}</span>
                  </li>
                ))
              ) : (
                <li>No single weight change flips this. The lead holds.</li>
              )}
            </ul>
          </div>
        )}

        {ready && (
          <details className="typed">
            <summary>Type the scores instead</summary>
            <div className="typed-grid">
              {model.options.map((o) => (
                <fieldset key={o.id}>
                  <legend>{optionLabel(model, o.id)}</legend>
                  {model.criteria.map((c) => (
                    <label key={c.id}>
                      <span>{criterionLabel(model, c.id)}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={SCORE_MIN}
                        max={SCORE_MAX}
                        step={1}
                        value={getScore(model.scores, o.id, c.id)}
                        aria-label={`${optionLabel(model, o.id)}, ${criterionLabel(model, c.id)} score`}
                        onChange={(e) => {
                          if (e.target.value === '') return
                          setScore(o.id, c.id, Number(e.target.value))
                        }}
                      />
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="dials" aria-labelledby={`${idPrefix}-matters`}>
        <div className="board-head">
          <h2 id={`${idPrefix}-matters`}>What matters</h2>
          {reset && (
            <button type="button" className="ghost" onClick={reset.onClick}>
              {reset.label}
            </button>
          )}
        </div>
        {model.criteria.length === 0 ? (
          <p className="empty-board">Nothing weighted yet.</p>
        ) : (
          <ul>
            {model.criteria.map((c, i) => {
              const name = criterionLabel(model, c.id)
              const pct = W ? Math.round((ws[i] / W) * 100) : 0
              return (
                <li key={c.id}>
                  <label className="dname" htmlFor={`${idPrefix}-w-${c.id}`}>
                    {name}
                  </label>
                  <span className="dval">
                    {c.weight} of 5, {pct}%
                  </span>
                  <input
                    id={`${idPrefix}-w-${c.id}`}
                    type="range"
                    min={WEIGHT_MIN}
                    max={WEIGHT_MAX}
                    step={1}
                    value={c.weight}
                    aria-valuetext={`${c.weight} of 5, ${pct} percent of the total`}
                    onChange={(e) => onChange(setWeightIn(model, c.id, Number(e.target.value)))}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
