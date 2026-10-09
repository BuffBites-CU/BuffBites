/**
 * Lightweight, explainable nutrition scoring for a combo.
 *
 * Inputs are the AI's approximate macros, so the score is a nudge, not a
 * clinical number. Targets follow the 2020–2025 Dietary Guidelines for
 * Americans' acceptable macro ranges for adults (protein 10–35%, carbs
 * 45–65%, fat 20–35% of calories), with protein weighted higher because
 * active college students (1.2–2.0 g/kg/day for those training) under-eat it
 * at dining halls more often than the other two.
 */

export interface Macros {
  calories: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
}

export interface MacroSplit {
  protein: number // fraction of calories, 0–1
  carbs: number
  fat: number
}

export interface FuelScore {
  score: number // 0–100
  label: string
  emoji: string
  reasons: string[]
}

export function macroSplit(m: Macros): MacroSplit | null {
  const p = (m.protein_g ?? 0) * 4
  const c = (m.carbs_g ?? 0) * 4
  const f = (m.fat_g ?? 0) * 9
  const total = p + c + f
  if (total <= 0) return null
  return { protein: p / total, carbs: c / total, fat: f / total }
}

/** 1 inside [lo, hi], falling linearly to 0 at `slack` outside the range. */
function band(x: number, lo: number, hi: number, slack: number): number {
  if (x >= lo && x <= hi) return 1
  const d = x < lo ? lo - x : x - hi
  return Math.max(0, 1 - d / slack)
}

export function fuelScore(m: Macros, perMealCalorieTarget = 700): FuelScore | null {
  if (!m.calories || !m.protein_g) return null
  const split = macroSplit(m)
  const reasons: string[] = []

  // Protein density (40 pts): 20–35% of calories from protein is ideal.
  const proteinPct = ((m.protein_g ?? 0) * 4) / m.calories
  const proteinPts = 40 * band(proteinPct, 0.2, 0.35, 0.15)
  if (proteinPct >= 0.2) reasons.push(`${m.protein_g}g protein`)
  else reasons.push('Low on protein')

  // Calorie fit (30 pts): within ±25% of the per-meal target.
  const t = perMealCalorieTarget
  const caloriePts = 30 * band(m.calories, t * 0.75, t * 1.25, t * 0.5)
  if (m.calories > t * 1.25) reasons.push('Big plate')
  else if (m.calories < t * 0.75) reasons.push('Light meal')

  // Macro balance (30 pts): carbs 40–60%, fat 20–35%.
  let balancePts = 15
  if (split) {
    balancePts = 15 * band(split.carbs, 0.4, 0.6, 0.2) + 15 * band(split.fat, 0.2, 0.35, 0.15)
    if (split.fat > 0.4) reasons.push('Fat-heavy')
    if (split.carbs > 0.65) reasons.push('Carb-heavy')
  }

  const score = Math.round(proteinPts + caloriePts + balancePts)
  const [label, emoji] =
    score >= 80 ? ['Elite fuel', '⚡'] :
    score >= 60 ? ['Solid fuel', '💪'] :
    score >= 40 ? ['Decent', '👍'] :
                  ['Treat meal', '🍩']
  return { score, label, emoji, reasons: reasons.slice(0, 2) }
}
