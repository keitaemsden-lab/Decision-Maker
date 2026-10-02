import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadDecisions, saveMatrixDecision, type Decision } from '../utils/storage'
import { formatDate } from '../utils/format'
import { getScore, rankOptions, tallyProsCons } from '../lib/engine'
import { effectiveWeights, f2, optionLabel, quickVerdict, sentenceText } from '../lib/verdict'
import { exampleMatrix } from '../lib/example'
import { useDocumentTitle } from '../components/useDocumentTitle'

function readout(d: Decision): { verdict: string; score: string } {
  if (d.mode === 'matrix') {
    if (d.options.length < 2 || d.criteria.length === 0) return { verdict: 'Not ranked yet', score: '' }
    const r = rankOptions(d)
    if (r.isTie) return { verdict: `Tie on ${f2(r.ranking[0].total)}`, score: f2(r.ranking[0].total) }
    return { verdict: `${optionLabel(d, r.winners[0])} leads by ${f2(r.margin)}`, score: f2(r.ranking[0].total) }
  }
  const { prosTotal, consTotal } = tallyProsCons(d.pros, d.cons)
  return { verdict: sentenceText({ ...quickVerdict(d.pros, d.cons), body: '', flag: '', tail: '' }), score: `${prosTotal}:${consTotal}` }
}

/** A thumbnail of the leader's row: widths are weights, fills are scores. */
function Strip({ d }: { d: Decision }) {
  if (d.mode === 'proscons') {
    const { prosTotal: p, consTotal: c } = tallyProsCons(d.pros, d.cons)
    return (
      <span className="strip quick" aria-hidden="true">
        <i className="tp" style={{ flexGrow: p || 0.0001 }} />
        <i className="tc" style={{ flexGrow: c || 0.0001 }} />
      </span>
    )
  }
  if (!d.options.length || !d.criteria.length) return <span className="strip" aria-hidden="true" />
  const lead = rankOptions(d).ranking[0].optionId
  const ws = effectiveWeights(d)
  return (
    <span className="strip" aria-hidden="true" style={{ gridTemplateColumns: ws.map((w) => `${w}fr`).join(' ') }}>
      {d.criteria.map((c) => (
        <i key={c.id}>
          <i style={{ transform: `scaleY(${getScore(d.scores, lead, c.id) / 10})` }} />
        </i>
      ))}
    </span>
  )
}

export default function Home() {
  const [decisions] = useState<Decision[]>(() => [...loadDecisions()].reverse())
  const navigate = useNavigate()
  useDocumentTitle(null)

  const openExample = () => {
    const d = saveMatrixDecision(exampleMatrix())
    navigate(`/decision/${d.id}`)
  }

  return (
    <main id="main">
      <div className="head">
        <h1>Big Decisions</h1>
        <p className="lede">Say what matters and how much. Score each option against it. Watch the ranking settle, and see what would change it.</p>
        <div className="actions">
          <Link className="btn primary" to="/new">
            New decision
          </Link>
          <button type="button" className="btn" onClick={openExample}>
            Open a worked example
          </button>
        </div>
      </div>

      <section aria-labelledby="list-h">
        <div className="board-head">
          <h2 id="list-h">Your decisions</h2>
          <span className="count mono">{decisions.length}</span>
        </div>
        {decisions.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Nothing weighed yet.</p>
            <p>Start a decision, or open the worked example to see a board with three job offers on it.</p>
          </div>
        ) : (
          <ul className="dlist">
            {decisions.map((d) => {
              const r = readout(d)
              return (
                <li key={d.id}>
                  <Link className="drow" to={`/decision/${d.id}`}>
                    <Strip d={d} />
                    <span className="dmain">
                      <span className="dtitle">{d.title}</span>
                      <span className="dmeta">
                        {d.mode === 'matrix' ? 'Matrix' : 'Quick call'}, {formatDate(d.createdAt)}
                      </span>
                    </span>
                    <span className="dverdict">{r.verdict}</span>
                    <span className="dscore mono" aria-hidden="true">
                      {r.score}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
