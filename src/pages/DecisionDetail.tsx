import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Board from '../components/Board'
import { Lede, Tally, WeightBlocks } from '../components/bits'
import { useDocumentTitle } from '../components/useDocumentTitle'
import type { DecisionModel } from '../lib/engine'
import { fileSlug, matrixCsv, matrixShareText, matrixVerdict, quickShareText, quickVerdict } from '../lib/verdict'
import { formatDate } from '../utils/format'
import { deleteDecision, getDecisionById, updateDecision, type Decision, type MatrixDecision } from '../utils/storage'

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const modelOf = (d: MatrixDecision): DecisionModel => ({ options: d.options, criteria: d.criteria, scores: d.scores })

function MatrixBoard({ decision }: { decision: MatrixDecision }) {
  const [opened] = useState(() => modelOf(decision))
  const [model, setModel] = useState(opened)
  const dirty = model !== opened
  const pending = useRef<DecisionModel | null>(null)

  // Weights and scores save as you go (debounced so a drag is one write, not fifty).
  useEffect(() => {
    if (model === opened) return
    pending.current = model
    const t = setTimeout(() => {
      updateDecision(decision.id, model)
      pending.current = null
    }, 250)
    return () => clearTimeout(t)
  }, [model, opened, decision.id])
  useEffect(
    () => () => {
      if (pending.current) updateDecision(decision.id, pending.current)
    },
    [decision.id],
  )

  return (
    <>
      <div className="verdict-block">
        <Lede s={matrixVerdict(model)} id="verdict" />
      </div>
      <Board
        model={model}
        onChange={setModel}
        idPrefix="dt"
        reset={dirty ? { label: 'Undo changes', onClick: () => setModel(opened) } : null}
      />
    </>
  )
}

export default function DecisionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Read synchronously so there is no loading flash; re-read when the id changes.
  const [state, setState] = useState<{ id?: string; d: Decision | undefined }>(() => ({ id, d: id ? getDecisionById(id) : undefined }))
  if (state.id !== id) setState({ id, d: id ? getDecisionById(id) : undefined })
  const decision = state.d
  const [status, setStatus] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  useDocumentTitle(decision ? decision.title : 'Decision not found')

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 5000)
    return () => clearTimeout(t)
  }, [confirmDelete])
  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(''), 4000)
    return () => clearTimeout(t)
  }, [status])

  if (!decision) {
    return (
      <main id="main">
        <div className="head">
          <h1>Decision not found</h1>
          <p className="lede">Nothing is saved at this address on this device. Decisions live in this browser only.</p>
          <div className="actions">
            <Link className="btn primary" to="/">
              Back to your decisions
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Always share the latest saved state (the board autosaves).
  const latest = () => getDecisionById(decision.id) ?? decision
  const shareText = () => {
    const d = latest()
    return d.mode === 'matrix' ? matrixShareText(d.title, modelOf(d)) : quickShareText(d.title, d.pros, d.cons)
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText())
      setStatus('Summary copied. Paste it anywhere.')
    } catch {
      setStatus('This browser blocked the clipboard. Use Export instead.')
    }
  }
  const onExport = () => {
    const d = latest()
    if (d.mode === 'matrix') download(`${fileSlug(d.title)}.csv`, matrixCsv(modelOf(d)), 'text/csv')
    else download(`${fileSlug(d.title)}.txt`, shareText(), 'text/plain')
    setStatus('Export downloaded.')
  }
  const onDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteDecision(decision.id)
    navigate('/')
  }

  return (
    <main id="main">
      <div className="head">
        <p className="crumb">
          <Link to="/">All decisions</Link>
          <span className="mono">
            {decision.mode === 'matrix' ? 'Matrix' : 'Quick call'}, {formatDate(decision.createdAt)}
          </span>
        </p>
        <h1 className="break-words">{decision.title}</h1>
      </div>

      {decision.mode === 'matrix' ? (
        <MatrixBoard key={decision.id} decision={decision} />
      ) : (
        <>
          <div className="verdict-block">
            <Lede s={quickVerdict(decision.pros, decision.cons)} live={false} />
            <Tally pros={decision.pros} cons={decision.cons} />
          </div>
          <div className="sides">
            {(['pros', 'cons'] as const).map((k) => (
              <section key={k} className={`side ${k === 'pros' ? 'for' : 'against'}`} aria-labelledby={`h-${k}`}>
                <h2 id={`h-${k}`}>{k === 'pros' ? 'For' : 'Against'}</h2>
                {decision[k].length === 0 ? (
                  <p className="empty-board">Nothing listed.</p>
                ) : (
                  <ul>
                    {decision[k].map((it) => (
                      <li key={it.id} className="item read">
                        <span className="itext">{it.text}</span>
                        <WeightBlocks weight={it.weight} against={k === 'cons'} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      <section className="toolbar" aria-labelledby="h-actions">
        <h2 id="h-actions" className="sr-only">
          Share and manage
        </h2>
        <div className="actions">
          <Link className="btn primary" to={`/decision/${decision.id}/edit`}>
            Edit
          </Link>
          <button type="button" className="btn" onClick={onCopy}>
            Copy summary
          </button>
          <button type="button" className="btn" onClick={onExport}>
            {decision.mode === 'matrix' ? 'Export CSV' : 'Export text'}
          </button>
          <button type="button" className={`btn danger${confirmDelete ? ' armed' : ''}`} onClick={onDelete}>
            {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
          {confirmDelete && (
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          )}
        </div>
        <p className="status" role="status">
          {status}
        </p>
      </section>
    </main>
  )
}
