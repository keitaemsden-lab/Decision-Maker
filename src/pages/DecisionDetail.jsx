import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getDecisionById, deleteDecision } from '../utils/storage';

const BADGE = {
  'lean yes':          { label: 'Lean Yes',          cls: 'bg-green-100 text-green-700' },
  'lean no':           { label: 'Lean No',           cls: 'bg-red-100 text-red-700' },
  'too close to call': { label: 'Too Close to Call', cls: 'bg-yellow-100 text-yellow-700' },
};

const DOTS = { 1: '\u25CF', 2: '\u25CF\u25CF', 3: '\u25CF\u25CF\u25CF' };

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function buildShareText(decision) {
  const prosScore = decision.pros.reduce((s, p) => s + p.weight, 0);
  const consScore = decision.cons.reduce((s, c) => s + c.weight, 0);
  const badge = BADGE[decision.recommendation]?.label ?? decision.recommendation;

  const proLines = decision.pros.map((p) => `  + ${p.text} (${DOTS[p.weight]})`).join('\n');
  const conLines = decision.cons.map((c) => `  - ${c.text} (${DOTS[c.weight]})`).join('\n');

  return [
    `Decision: ${decision.title}`,
    `Verdict: ${badge}`,
    '',
    'Pros:',
    proLines,
    '',
    'Cons:',
    conLines,
    '',
    `Score: Pros ${prosScore} pts vs Cons ${consScore} pts`,
  ].join('\n');
}

export default function DecisionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [decision, setDecision] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const d = getDecisionById(id);
    if (d) {
      setDecision(d);
    } else {
      setNotFound(true);
    }
  }, [id]);

  // --- Not found state ---
  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-gray-500 mt-20">Decision not found.</p>
          <Link
            to="/"
            className="mt-4 inline-block text-indigo-600 font-medium hover:underline"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // --- Loading state ---
  if (!decision) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-gray-400 mt-20 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const badge = BADGE[decision.recommendation] ?? {
    label: decision.recommendation,
    cls: 'bg-gray-100 text-gray-600',
  };

  const prosScore = decision.pros.reduce((s, p) => s + p.weight, 0);
  const consScore = decision.cons.reduce((s, c) => s + c.weight, 0);

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteDecision(decision.id);
    navigate('/');
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(buildShareText(decision));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing visible
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto">

        {/* Back link */}
        <Link
          to="/"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6 inline-block"
        >
          &larr; All decisions
        </Link>

        {/* Main card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">

          {/* Header: title + badge + date */}
          <div className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold text-gray-900 leading-snug">
                {decision.title}
              </h1>
              <span
                className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}
              >
                {badge.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {formatDate(decision.createdAt)}
            </p>
          </div>

          {/* Score breakdown */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1 bg-green-50 border border-green-100 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">
                Pros
              </p>
              <p className="text-2xl font-bold text-green-700">{prosScore}<span className="text-sm font-medium ml-1">pts</span></p>
            </div>
            <div className="flex-1 bg-red-50 border border-red-100 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">
                Cons
              </p>
              <p className="text-2xl font-bold text-red-700">{consScore}<span className="text-sm font-medium ml-1">pts</span></p>
            </div>
          </div>

          {/* Pros & Cons columns */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Pros */}
            <div>
              <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">
                Pros
              </h3>
              <ul className="space-y-2">
                {decision.pros.map((p) => (
                  <li
                    key={p.id ?? p.text}
                    className="bg-green-50 rounded-lg px-3 py-2"
                  >
                    <p className="text-sm text-gray-800">{p.text}</p>
                    <p className="text-green-500 text-xs mt-0.5 tracking-widest">
                      {DOTS[p.weight]}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {/* Cons */}
            <div>
              <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                Cons
              </h3>
              <ul className="space-y-2">
                {decision.cons.map((c) => (
                  <li
                    key={c.id ?? c.text}
                    className="bg-red-50 rounded-lg px-3 py-2"
                  >
                    <p className="text-sm text-gray-800">{c.text}</p>
                    <p className="text-red-400 text-xs mt-0.5 tracking-widest">
                      {DOTS[c.weight]}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm"
            >
              {copied ? 'Copied!' : 'Share'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className={`flex-1 font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm ${
                confirmDelete
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'border border-red-200 text-red-600 hover:bg-red-50'
              }`}
            >
              {confirmDelete ? 'Confirm Delete' : 'Delete Decision'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
