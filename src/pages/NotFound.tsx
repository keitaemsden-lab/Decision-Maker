import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../components/useDocumentTitle'

export default function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <main id="main">
      <div className="head nf">
        <span className="nf-board" aria-hidden="true">
          <i /> <i /> <i /> <i />
        </span>
        <h1>Page not found</h1>
        <p className="lede">That address does not match anything here. Nothing was weighed, nothing was lost.</p>
        <div className="actions">
          <Link className="btn primary" to="/">
            Back to your decisions
          </Link>
          <Link className="btn" to="/new">
            Start a new decision
          </Link>
        </div>
      </div>
    </main>
  )
}
