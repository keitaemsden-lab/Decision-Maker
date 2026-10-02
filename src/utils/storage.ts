// ─── Constants ───────────────────────────────────────────────────────────────
const STORAGE_KEY = 'decisions';

// ─── Recommendation Logic ────────────────────────────────────────────────────

/**
 * Calculates a recommendation based on weighted pros vs weighted cons.
 *
 * Each pro/con has a `weight` (1–3). The function sums the weights for pros
 * and cons separately, then compares them:
 *   - pros total > cons total  → "lean yes"
 *   - cons total > pros total  → "lean no"
 *   - equal                    → "too close to call"
 *
 * @param {Array<{text: string, weight: number}>} pros
 * @param {Array<{text: string, weight: number}>} cons
 * @returns {"lean yes" | "lean no" | "too close to call"}
 */
export function calculateRecommendation(pros = [], cons = []) {
  const prosTotal = pros.reduce((sum, p) => sum + p.weight, 0);
  const consTotal = cons.reduce((sum, c) => sum + c.weight, 0);

  if (prosTotal > consTotal) return 'lean yes';
  if (consTotal > prosTotal) return 'lean no';
  return 'too close to call';
}

// ─── CRUD Helpers ────────────────────────────────────────────────────────────

/**
 * Load all saved decisions from localStorage.
 * @returns {Array<Object>} Array of decision objects (empty array if none).
 */
export function loadDecisions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    console.error('Failed to load decisions from localStorage');
    return [];
  }
}

/**
 * Persist the full decisions array to localStorage.
 * @param {Array<Object>} decisions
 */
function persistDecisions(decisions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
}

/**
 * Save a new decision to localStorage.
 *
 * @param {Object} params
 * @param {string}                              params.title - The decision being made.
 * @param {Array<{text: string, weight: number}>} params.pros  - Pro arguments (weight 1-3).
 * @param {Array<{text: string, weight: number}>} params.cons  - Con arguments (weight 1-3).
 * @returns {Object} The newly created decision object.
 */
export function saveDecision({ title, pros = [], cons = [] }) {
  const decision = {
    id: Date.now().toString(),
    title,
    pros,
    cons,
    createdAt: new Date().toISOString(),
    recommendation: calculateRecommendation(pros, cons),
  };

  const decisions = loadDecisions();
  decisions.push(decision);
  persistDecisions(decisions);

  return decision;
}

/**
 * Retrieve a single decision by its id.
 * @param {string} id
 * @returns {Object | undefined}
 */
export function getDecisionById(id) {
  return loadDecisions().find((d) => d.id === id);
}

/**
 * Delete a decision by its id.
 * @param {string} id
 * @returns {boolean} True if a decision was removed.
 */
export function deleteDecision(id) {
  const decisions = loadDecisions();
  const filtered = decisions.filter((d) => d.id !== id);

  if (filtered.length === decisions.length) return false;

  persistDecisions(filtered);
  return true;
}

/**
 * Update an existing decision (merges provided fields).
 * Automatically recalculates the recommendation when pros or cons change.
 *
 * @param {string} id
 * @param {Object} updates - Partial decision fields to merge.
 * @returns {Object | null} The updated decision, or null if not found.
 */
export function updateDecision(id, updates) {
  const decisions = loadDecisions();
  const index = decisions.findIndex((d) => d.id === id);

  if (index === -1) return null;

  const merged = { ...decisions[index], ...updates };

  // Recalculate recommendation whenever pros/cons may have changed
  merged.recommendation = calculateRecommendation(merged.pros, merged.cons);

  decisions[index] = merged;
  persistDecisions(decisions);

  return merged;
}
