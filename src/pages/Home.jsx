import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadDecisions } from '../utils/storage';

const BADGE = {
  'lean yes':          { label: 'Lean Yes',  cls: 'bg-green-100  text-green-700'  },
  'lean no':           { label: 'Lean No',   cls: 'bg-red-100    text-red-700'    },
  'too close to call': { label: 'Too Close', cls: 'bg-yellow-100 text-yellow-700' },
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function Home() {
  const [decisions, setDecisions] = useState([]);

  useEffect(() => {
    setDecisions([...loadDecisions()].reverse());
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto">

        {/* Subtitle */}
        <p className="text-gray-500 mb-6">Stop overthinking. Start deciding.</p>

        {/* Past decisions */}
        {decisions.length === 0 ? (
          <p className="text-center text-gray-400 mt-20 text-sm">
            No decisions yet — make your first one!
          </p>
        ) : (
          <ul className="space-y-3">
            {decisions.map((d) => {
              const badge = BADGE[d.recommendation] ?? { label: d.recommendation, cls: 'bg-gray-100 text-gray-600' };
              return (
                <li
                  key={d.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3"
                >
                  {/* Title + date */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{d.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(d.createdAt)}</p>
                  </div>

                  {/* Recommendation badge */}
                  <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                    {badge.label}
                  </span>

                  {/* View link */}
                  <Link
                    to={`/decision/${d.id}`}
                    className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    View →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

      </div>
    </div>
  );
}
