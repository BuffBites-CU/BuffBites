export type DietaryPreference = 'vegan' | 'vegetarian' | 'gluten-free' | 'halal'

export interface NutritionGoals {
  protein_g_per_meal?: number | null
  dietary_focus?: 'balanced' | 'high-protein' | 'low-carb' | 'weight-loss' | 'muscle-gain' | 'endurance' | null
  priority_nutrients?: string[]   // 'iron'|'calcium'|'vitamin-d'|'fiber'|'omega-3'|'b12'|'zinc'
}

export interface MealLogEntry {
  title: string
  calories: number
  protein_g?: number | null
  fat_g?: number | null
  carbs_g?: number | null
  date: string       // YYYY-MM-DD
  dining_hall: string
  meal_period: string
  logged_at: string
}

export interface FavoriteCombo {
  title: string
  dining_hall: string
  date: string
  description?: string | null
  approximate_calories?: number | null
  tags: ComboTag[]
  dishes: Array<{ name: string; station: string }>
  saved_at: string
}

/** POST /api/users/ body. The server takes the uid and email from the ID token. */
export interface UserCreate {
  username: string
  dietary_preferences: DietaryPreference[]
  restrictions?: string[]
  avatar?: string
  preferred_calories_per_meal?: number
  default_dining_hall?: string
  nutrition_goals?: NutritionGoals
}

/** PUT /api/users/{uid} body: only the fields to change. `null` clears an optional field. */
export interface UserUpdate {
  username?: string
  dietary_preferences?: DietaryPreference[]
  restrictions?: string[]
  avatar?: string | null
  preferred_calories_per_meal?: number | null
  default_dining_hall?: string | null
  nutrition_goals?: NutritionGoals | null
}

/** GET /api/users/{uid}: the signed-in user's own profile. Unset fields are null. */
export interface UserResponse {
  firebase_uid: string
  email: string
  username: string
  dietary_preferences: DietaryPreference[]
  restrictions: string[]
  avatar: string | null
  karma: number
  created_at: string
  preferred_calories_per_meal: number | null
  default_dining_hall: string | null
  nutrition_goals: NutritionGoals | null
  meal_log: MealLogEntry[]
  favorites: FavoriteCombo[]
}

export type DiningHall = 'alley' | 'c4c' | 'libby' | 'seec' | 'sewall' | 'village_center'

export const DINING_HALL_LABELS: Record<DiningHall, string> = {
  alley: 'The Alley',
  c4c: 'C4C',
  libby: 'Libby',
  seec: 'SEEC Cafe',
  sewall: 'Sewall',
  village_center: 'Village Center',
}

/** Halls that aren't serving right now. They stay in the type and labels so old
 *  community posts still render, but every picker hides them. Delete the entry
 *  when the hall reopens. */
export const CLOSED_HALLS: Partial<Record<DiningHall, string>> = {
  alley: 'Closed for remodel until Aug 2028',
}

export const ALL_DINING_HALLS: DiningHall[] = ['alley', 'c4c', 'libby', 'seec', 'sewall', 'village_center']

/** Halls students can pick today. */
export const DINING_HALLS: DiningHall[] = ALL_DINING_HALLS.filter((h) => !CLOSED_HALLS[h])

export type MealPeriod = 'Breakfast' | 'Lunch' | 'Dinner'

export const MEAL_PERIODS: MealPeriod[] = ['Breakfast', 'Lunch', 'Dinner']

export type ComboTag =
  | 'vegan'
  | 'vegetarian'
  | 'high-protein'
  | 'light'
  | 'hearty'
  | 'balanced'
  | 'gluten-free'
  | 'halal'
  | 'low-carb'
  | 'high-fiber'
  | 'comfort-food'
  | 'omega-3'
  | 'high-carb'
  | 'low-calorie'
  | string

export interface Dish {
  name: string
  station: string
}

export interface Combo {
  title: string
  description: string
  dishes: Dish[]
  approximate_calories: number
  approximate_protein_g: number
  approximate_fat_g?: number
  approximate_carbs_g?: number
  tags: ComboTag[]
}

export interface CombosMap {
  Breakfast: Combo[]
  Lunch: Combo[]
  Dinner: Combo[]
}

export interface ComboResponse {
  dining_location: string
  date: string
  day_of_week: string
  combos: CombosMap
}

export interface DishItem {
  name: string
  station: string
  servings: number
}

export interface ComboCreate {
  title: string
  dining_hall: DiningHall
  date: string
  dishes: DishItem[]
  tags: ComboTag[]
  description?: string
  images: string[]
  notes?: string
}

export interface CommunityCombo extends ComboCreate {
  id: string
  upvotes: number
  downvotes: number
  author_username: string
  author_firebase_uid: string
  created_at: string
  expires_at: string
  has_voted?: boolean
}

export interface Comment {
  id: string
  combo_id: string
  text: string
  author_username: string
  author_firebase_uid: string
  created_at: string
}

export interface ComboUpdate {
  title?: string
  description?: string
  tags?: ComboTag[]
  dishes?: DishItem[]
  notes?: string
}

export type VoteType = 'upvote' | 'downvote'

export interface MenuItem {
  name: string
  description?: string
  calories?: number
  is_vegan?: boolean
  is_vegetarian?: boolean
}

export interface MenuResponse {
  dining_location: string
  date: string
  day_of_week: string
  categories: Record<string, MenuItem[]>
}

export interface PlateItem {
  name: string
  station: string
  portion: number
  confidence: 'high' | 'medium' | 'low'
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sodium_mg: number
  added_sugar_g: number
}

export interface PlateAnalysis {
  dining_location: string
  date: string
  is_food: boolean
  items: PlateItem[]
  unmatched: Array<{ description: string }>
  totals: Record<'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sodium_mg' | 'added_sugar_g', number>
  notes: string
}

// ── Strava link + fuel coach ────────────────────────────────────────────────

export interface StravaStatus {
  available: boolean
  connected: boolean
  athlete_name: string | null
  connected_at: string | null
  scopes: string[]
}

export type BodySex = 'male' | 'female' | 'unspecified'

export interface BodyStats {
  weight_kg: number | null
  height_cm: number | null
  age: number | null
  sex: BodySex | null
}

export interface Macros {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface Workout {
  name: string
  sport: string
  date: string
  start_time: string
  minutes: number
  distance_km: number
  elevation_m: number
  kcal: number
  method: 'power' | 'pace' | 'met'
}

export interface FuelBudget {
  date: string
  bmr: number
  baseline_kcal: number
  exercise_kcal: number
  goal_adjust_kcal: number
  target_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  training_load: 'rest' | 'light' | 'moderate' | 'high' | 'very high'
  focus: string | null
  eaten: Macros
  remaining_kcal: number
  body: { weight_kg: number; height_cm: number; age: number; sex: string; estimated: string[] }
  training: {
    connected: boolean
    today: Workout[]
    week_sessions: number
    week_minutes: number
    week_kcal: number
    error: string | null
  }
  notes: string[]
}

export interface FuelPlanItem {
  name: string
  station: string
  servings: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface FuelPlanMeal {
  period: MealPeriod | 'Snack'
  title: string
  why: string
  items: FuelPlanItem[]
  totals: Macros
  target_kcal: number | null
  target_protein_g: number | null
}

export interface FuelPlan {
  date: string
  dining_location: string
  budget: FuelBudget
  meals: FuelPlanMeal[]
  totals: Macros
  planned_kcal: number
  planned_protein_g: number
  headline: string
  tips: string[]
  assumptions: string[]
}
