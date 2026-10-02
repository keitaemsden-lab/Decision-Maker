import { SCORE_MAX, SCORE_MIN, WEIGHT_MAX, WEIGHT_MIN, type DecisionModel } from './engine'

export function setScoreIn(model: DecisionModel, optionId: string, criterionId: string, value: number): DecisionModel {
  const v = Math.round(Math.min(SCORE_MAX, Math.max(SCORE_MIN, value)))
  return { ...model, scores: { ...model.scores, [optionId]: { ...model.scores[optionId], [criterionId]: v } } }
}

export function setWeightIn(model: DecisionModel, criterionId: string, value: number): DecisionModel {
  const w = Math.round(Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, value)))
  return { ...model, criteria: model.criteria.map((c) => (c.id === criterionId ? { ...c, weight: w } : c)) }
}

/** Score from a pointer's height inside a block: top edge is 10, bottom edge is 0. */
export function scoreFromY(top: number, height: number, y: number): number {
  if (height <= 0) return SCORE_MIN
  const v = Math.ceil((1 - (y - top) / height) * SCORE_MAX)
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, v))
}
