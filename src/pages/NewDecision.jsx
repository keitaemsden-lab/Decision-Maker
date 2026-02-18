import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveDecision, calculateRecommendation } from '../utils/storage';

const WEIGHT_LABELS = [
  { label: 'Minor', value: 1 },
  { label: 'Moderate', value: 2 },
  { label: 'Major', value: 3 },
];

const MAX_ITEMS = 8;

function ProgressBar({ step }) {
  return (
    <div className="mb-8">
      <p className="text-sm text-gray-500 mb-2">Step {step} of 4</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${
              s <= step ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function WeightButtons({ value, onChange }) {
  return (
    <div className="flex gap-1 mt-1">
      {WEIGHT_LABELS.map(({ label, value: wv }) => (
        <button
          key={wv}
          type="button"
          onClick={() => onChange(wv)}
          className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
            value === wv
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ItemList({ items, setItems, placeholder, type }) {
  function updateText(index, text) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, text } : item))
    );
  }

  function updateWeight(index, weight) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, weight } : item))
    );
  }

  function addItem() {
    if (items.length < MAX_ITEMS) {
      setItems((prev) => [...prev, { id: crypto.randomUUID(), text: '', weight: 1 }]);
    }
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.id} className="flex gap-2 items-start">
          <div className="flex-1">
            <input
              type="text"
              value={item.text}
              onChange={(e) => updateText(index, e.target.value)}
              placeholder={placeholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <WeightButtons
              value={item.weight}
              onChange={(w) => updateWeight(index, w)}
            />
          </div>
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="mt-1.5 text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
              aria-label="Remove"
            >
              &times;
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        disabled={items.length >= MAX_ITEMS}
        className="text-indigo-600 text-sm font-medium hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
      >
        + Add another {type}
      </button>
    </div>
  );
}

export default function NewDecision() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [pros, setPros] = useState([{ id: crypto.randomUUID(), text: '', weight: 1 }]);
  const [cons, setCons] = useState([{ id: crypto.randomUUID(), text: '', weight: 1 }]);

  const filteredPros = pros.filter((p) => p.text.trim() !== '');
  const filteredCons = cons.filter((c) => c.text.trim() !== '');

  const prosScore = filteredPros.reduce((sum, p) => sum + p.weight, 0);
  const consScore = filteredCons.reduce((sum, c) => sum + c.weight, 0);
  const recommendation = calculateRecommendation(filteredPros, filteredCons);

  function handleNext() {
    if (step >= 4) return;
    if (step === 1 && title.trim() === '') return;
    if (step === 2 && filteredPros.length === 0) return;
    if (step === 3 && filteredCons.length === 0) return;
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => s - 1);
  }

  function handleSave() {
    saveDecision({ title, pros: filteredPros, cons: filteredCons });
    navigate('/');
  }

  const recommendationStyle =
    recommendation === 'lean yes'
      ? 'bg-green-100 text-green-800'
      : recommendation === 'lean no'
      ? 'bg-red-100 text-red-800'
      : 'bg-yellow-100 text-yellow-800';

  const recommendationLabel =
    recommendation === 'lean yes'
      ? 'Lean Yes'
      : recommendation === 'lean no'
      ? 'Lean No'
      : 'Too Close to Call';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto">
        <ProgressBar step={step} />

        {step === 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              What's your decision?
            </h2>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Should I quit my job?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              autoFocus
            />
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                disabled={title.trim() === ''}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              What are the pros?
            </h2>
            <ItemList
              items={pros}
              setItems={setPros}
              placeholder="Enter a pro..."
              type="pro"
            />
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="border border-gray-300 text-gray-600 font-medium py-2.5 px-6 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={filteredPros.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              What are the cons?
            </h2>
            <ItemList
              items={cons}
              setItems={setCons}
              placeholder="Enter a con..."
              type="con"
            />
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="border border-gray-300 text-gray-600 font-medium py-2.5 px-6 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={filteredCons.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Review</h2>
            <p className="text-gray-500 text-sm mb-5">"{title}"</p>

            <div className="flex gap-4 mb-5">
              <div className="flex-1 bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">
                  Pros Score
                </p>
                <p className="text-2xl font-bold text-green-700">{prosScore}</p>
              </div>
              <div className="flex-1 bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">
                  Cons Score
                </p>
                <p className="text-2xl font-bold text-red-700">{consScore}</p>
              </div>
            </div>

            <div className="flex items-center justify-center mb-6">
              <span
                className={`animate-fade-in-scale inline-block px-4 py-1.5 rounded-full text-sm font-semibold ${recommendationStyle}`}
              >
                {recommendationLabel}
              </span>
            </div>

            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="border border-gray-300 text-gray-600 font-medium py-2.5 px-6 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-xl transition-colors"
              >
                Save Decision
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
