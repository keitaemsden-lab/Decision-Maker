import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Board from '../components/Board'
import { Lede, Tally } from '../components/bits'
import { useDocumentTitle } from '../components/useDocumentTitle'
import type { Criterion, DecisionModel, Option, ProsConsWeight } from '../lib/engine'
import { matrixVerdict, quickVerdict } from '../lib/verdict'
import {
  getDecisionById,
  saveDecision,
  saveMatrixDecision,
  updateDecision,
  type ProsConsItem,
} from '../utils/storage'

const MAX_OPTIONS = 8
const MAX_CRITERIA = 10
const MAX_ITEMS = 8
const DEFAULT_SCORE = 5
const DEFAULT_WEIGHT = 3

type Mode = 'matrix' | 'proscons'
const uid = () => globalThis.crypto.randomUUID()

function blankMatrix(): DecisionModel {
  const options: Option[] = [
    { id: uid(), name: '' },
    { id: uid(), name: '' },
  ]
  const criteria: Criterion[] = [
    { id: uid(), name: '', weight: DEFAULT_WEIGHT },
    { id: uid(), name: '', weight: DEFAULT_WEIGHT },
  ]
  const scores: DecisionModel['scores'] = {}
  for (const o of options) scores[o.id] = Object.fromEntries(criteria.map((c) => [c.id, DEFAULT_SCORE]))
  return { options, criteria, scores }
}

const blankItem = (): ProsConsItem => ({ id: uid(), text: '', weight: 1 })
const WEIGHTS: { value: ProsConsWeight; label: string }[] = [
  { value: 1, label: 'Minor' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'Major' },
]

function ItemList({
  side,
  items,
  setItems,
}: {
  side: 'for' | 'against'
  items: ProsConsItem[]
  setItems: (xs: ProsConsItem[]) => void
}) {
  const word = side === 'for' ? 'Reason for' : 'Reason against'
  const update = (id: string, patch: Partial<ProsConsItem>) => setItems(items.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  return (
    <section className={`side ${side}`} aria-labelledby={`h-${side}`}>
      <h2 id={`h-${side}`}>{side === 'for' ? 'For' : 'Against'}</h2>
      <ul>
        {items.map((it, i) => (
          <li key={it.id} className="item">
            <input
              className="field"
              value={it.text}
              maxLength={120}
              placeholder={side === 'for' ? 'A reason to do it' : 'A reason not to'}
              aria-label={`${word} ${i + 1}`}
              onChange={(e) => update(it.id, { text: e.target.value })}
            />
            <span className="wgroup" role="group" aria-label={`Weight for ${word.toLowerCase()} ${i + 1}`}>
              {WEIGHTS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  aria-pressed={it.weight === w.value}
                  aria-label={w.label}
                  title={w.label}
                  className={it.weight >= w.value ? 'on' : ''}
                  onClick={() => update(it.id, { weight: w.value })}
                >
                  <i aria-hidden="true" />
                </button>
              ))}
            </span>
            <button
              type="button"
              className="del"
              aria-label={`Remove ${word.toLowerCase()} ${i + 1}`}
              onClick={() => setItems(items.filter((x) => x.id !== it.id))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn add"
        disabled={items.length >= MAX_ITEMS}
        onClick={() => setItems([...items, blankItem()])}
      >
        {items.length >= MAX_ITEMS ? `${MAX_ITEMS} is the limit` : `Add a reason ${side}`}
      </button>
    </section>
  )
}

function NameList({
  kind,
  rows,
  max,
  onRename,
  onRemove,
  onAdd,
  min,
}: {
  kind: 'option' | 'criterion'
  rows: { id: string; name: string }[]
  max: number
  min: number
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  onAdd: () => void
}) {
  const noun = kind === 'option' ? 'Option' : 'What matters'
  return (
    <ol className="names">
      {rows.map((r, i) => (
        <li key={r.id}>
          <span className="idx mono" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <input
            className="field"
            value={r.name}
            maxLength={60}
            placeholder={kind === 'option' ? `Option ${i + 1}, for example a job or a suburb` : `Something that matters, for example cost`}
            aria-label={`${noun} ${i + 1} name`}
            onChange={(e) => onRename(r.id, e.target.value)}
          />
          <button
            type="button"
            className="del"
            disabled={rows.length <= min}
            aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`}
            onClick={() => onRemove(r.id)}
          >
            Remove
          </button>
        </li>
      ))}
      <li className="names-add">
        <button type="button" className="btn add" disabled={rows.length >= max} onClick={onAdd}>
          {rows.length >= max ? `${max} is the limit` : kind === 'option' ? 'Add an option' : 'Add something that matters'}
        </button>
      </li>
    </ol>
  )
}

export default function NewDecision() {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = useMemo(() => (id ? getDecisionById(id) : undefined), [id])
  const editing = Boolean(existing)

  const [title, setTitle] = useState(existing?.title ?? '')
  const [mode, setMode] = useState<Mode>(existing?.mode ?? 'matrix')
  const [matrix, setMatrix] = useState<DecisionModel>(() =>
    existing?.mode === 'matrix' ? { options: existing.options, criteria: existing.criteria, scores: existing.scores } : blankMatrix(),
  )
  const [pros, setPros] = useState<ProsConsItem[]>(() => (existing?.mode === 'proscons' ? existing.pros : [blankItem()]))
  const [cons, setCons] = useState<ProsConsItem[]>(() => (existing?.mode === 'proscons' ? existing.cons : [blankItem()]))
  const [errors, setErrors] = useState<string[]>([])
  const errRef = useRef<HTMLDivElement>(null)

  useDocumentTitle(editing ? `Edit: ${existing!.title}` : 'New decision')

  // M and Q switch modes on a new decision, unless the person is typing.
  useEffect(() => {
    if (editing) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"], [role="slider"]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'm' || e.key === 'M') setMode('matrix')
      if (e.key === 'q' || e.key === 'Q') setMode('proscons')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editing])

  if (id && !existing) {
    return (
      <main id="main">
        <div className="head">
          <h1>Decision not found</h1>
          <p className="lede">There is nothing saved at this address on this device, so there is nothing to edit.</p>
          <div className="actions">
            <Link className="btn primary" to="/">
              Back to your decisions
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const addOption = () => {
    const o = { id: uid(), name: '' }
    setMatrix((m) => ({
      ...m,
      options: [...m.options, o],
      scores: { ...m.scores, [o.id]: Object.fromEntries(m.criteria.map((c) => [c.id, DEFAULT_SCORE])) },
    }))
  }
  const addCriterion = () => {
    const c = { id: uid(), name: '', weight: DEFAULT_WEIGHT }
    setMatrix((m) => ({
      ...m,
      criteria: [...m.criteria, c],
      scores: Object.fromEntries(m.options.map((o) => [o.id, { ...m.scores[o.id], [c.id]: DEFAULT_SCORE }])),
    }))
  }
  const removeOption = (oid: string) =>
    setMatrix((m) => {
      const scores = { ...m.scores }
      delete scores[oid]
      return { ...m, options: m.options.filter((o) => o.id !== oid), scores }
    })
  const removeCriterion = (cid: string) =>
    setMatrix((m) => ({
      ...m,
      criteria: m.criteria.filter((c) => c.id !== cid),
      scores: Object.fromEntries(
        Object.entries(m.scores).map(([oid, row]) => {
          const r = { ...row }
          delete r[cid]
          return [oid, r]
        }),
      ),
    }))

  const validate = (): string[] => {
    const out: string[] = []
    if (!title.trim()) out.push('Give the decision a title.')
    if (mode === 'matrix') {
      if (matrix.options.length < 2) out.push('Add at least two options.')
      if (matrix.options.some((o) => !o.name.trim())) out.push('Name every option, or remove the blank ones.')
      if (matrix.criteria.length < 1) out.push('Add at least one thing that matters.')
      if (matrix.criteria.some((c) => !c.name.trim())) out.push('Name everything that matters, or remove the blank ones.')
    }
    return out
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (errs.length) {
      requestAnimationFrame(() => errRef.current?.focus())
      return
    }
    const t = title.trim()
    if (mode === 'matrix') {
      const clean = {
        options: matrix.options.map((o) => ({ ...o, name: o.name.trim() })),
        criteria: matrix.criteria.map((c) => ({ ...c, name: c.name.trim() })),
        scores: matrix.scores,
      }
      const saved = editing ? updateDecision(id!, { title: t, ...clean }) : saveMatrixDecision({ title: t, ...clean })
      navigate(`/decision/${saved!.id}`)
    } else {
      const keep = (xs: ProsConsItem[]) => xs.map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text)
      const saved = editing
        ? updateDecision(id!, { title: t, pros: keep(pros), cons: keep(cons) })
        : saveDecision({ title: t, pros: keep(pros), cons: keep(cons) })
      navigate(`/decision/${saved!.id}`)
    }
  }

  const filled = (xs: ProsConsItem[]) => xs.filter((x) => x.text.trim())
  // Only keep a submitted error on screen while it is still true, so fixing a field clears its message.
  const liveErrors = errors.length ? errors.filter((x) => validate().includes(x)) : errors

  return (
    <main id="main">
      <form className="editor" onSubmit={onSubmit} noValidate>
        <div className="head">
          <p className="crumb">
            <Link to={editing ? `/decision/${id}` : '/'}>{editing ? 'Back to the decision' : 'All decisions'}</Link>
          </p>
          <h1>{editing ? 'Edit decision' : 'New decision'}</h1>
          <label className="title-field">
            <span className="label">What are you deciding?</span>
            <input
              className="field big"
              value={title}
              maxLength={140}
              placeholder="For example, which offer do I take?"
              aria-label="Decision title"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        </div>

        {!editing && (
          <fieldset className="modes-pick">
            <legend className="label">How do you want to weigh it?</legend>
            <div className="tiles">
              <button type="button" className="tile" aria-pressed={mode === 'matrix'} onClick={() => setMode('matrix')}>
                <span className="tile-glyph matrix" aria-hidden="true">
                  <i /> <i /> <i />
                </span>
                <span className="tile-name">
                  Matrix <kbd>M</kbd>
                </span>
                <span className="tile-note">Several options, scored against what matters to you.</span>
              </button>
              <button type="button" className="tile" aria-pressed={mode === 'proscons'} onClick={() => setMode('proscons')}>
                <span className="tile-glyph quick" aria-hidden="true">
                  <i /> <i />
                </span>
                <span className="tile-name">
                  Quick call <kbd>Q</kbd>
                </span>
                <span className="tile-note">One yes or no, weighed for and against.</span>
              </button>
            </div>
          </fieldset>
        )}

        {mode === 'matrix' ? (
          <>
            <div className="setup">
              <section aria-labelledby="h-options">
                <div className="board-head">
                  <h2 id="h-options">Options</h2>
                  <span className="count mono">{matrix.options.length} of {MAX_OPTIONS}</span>
                </div>
                <NameList
                  kind="option"
                  rows={matrix.options}
                  max={MAX_OPTIONS}
                  min={1}
                  onAdd={addOption}
                  onRemove={removeOption}
                  onRename={(oid, name) => setMatrix((m) => ({ ...m, options: m.options.map((o) => (o.id === oid ? { ...o, name } : o)) }))}
                />
              </section>
              <section aria-labelledby="h-criteria">
                <div className="board-head">
                  <h2 id="h-criteria">Things that matter</h2>
                  <span className="count mono">{matrix.criteria.length} of {MAX_CRITERIA}</span>
                </div>
                <NameList
                  kind="criterion"
                  rows={matrix.criteria}
                  max={MAX_CRITERIA}
                  min={1}
                  onAdd={addCriterion}
                  onRemove={removeCriterion}
                  onRename={(cid, name) =>
                    setMatrix((m) => ({ ...m, criteria: m.criteria.map((c) => (c.id === cid ? { ...c, name } : c)) }))
                  }
                />
              </section>
            </div>
            <div className="verdict-block">
              <Lede s={matrixVerdict(matrix)} />
            </div>
            <Board model={matrix} onChange={setMatrix} idPrefix="ed" />
          </>
        ) : (
          <>
            <div className="verdict-block">
              <Lede s={quickVerdict(filled(pros), filled(cons))} />
              <Tally pros={filled(pros)} cons={filled(cons)} />
            </div>
            <div className="sides">
              <ItemList side="for" items={pros} setItems={setPros} />
              <ItemList side="against" items={cons} setItems={setCons} />
            </div>
          </>
        )}

        <div className="savebar">
          {liveErrors.length > 0 && (
            <div className="errors" role="alert" tabIndex={-1} ref={errRef}>
              {liveErrors.map((x) => (
                <p key={x}>{x}</p>
              ))}
            </div>
          )}
          <div className="actions">
            <button type="submit" className="btn primary">
              {editing ? 'Save changes' : 'Save decision'}
            </button>
            <Link className="btn" to={editing ? `/decision/${id}` : '/'}>
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </main>
  )
}
