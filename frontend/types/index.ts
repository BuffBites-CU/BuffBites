export type DietaryPreference = 'vegan' | 'vegetarian' | 'gluten-free' | 'halal'

export interface NutritionGoals {
  protein_g_per_meal?: number
  dietary_focus?: 'balanced' | 'high-protein' | 'low-carb' | 'weight-loss' | 'muscle-gain' | 'endurance'
  priority_nutrients?: string[]   // 'iron'|'calcium'|'vitamin-d'|'fiber'|'omega-3'|'b12'|'zinc'
}

export interface MealLogEntry {
  title: string
  calories: number
  protein_g?: number
  date: string       // YYYY-MM-DD
  dining_hall: string
  meal_period: string
  logged_at: string
}

export interface FavoriteCombo {
  title: string
  dining_hall: string
  date: string
  description?: string
  approximate_calories?: number
  tags: ComboTag[]
  dishes: Array<{ name: string; station: string }>
  saved_at: string
}

export interface UserCreate {
  firebase_uid: string
  email: string
  username: string
  dietary_preferences: DietaryPreference[]
  restrictions?: string[]
  avatar?: string
  preferred_calories_per_meal?: number
  default_dining_hall?: string
}

export interface UserResponse extends UserCreate {
  id: string
  karma: number
  created_at: string
  preferred_calories_per_meal?: number
  default_dining_hall?: string
  nutrition_goals?: NutritionGoals
  meal_log?: MealLogEntry[]
  favorites?: FavoriteCombo[]
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

export const DINING_HALLS: DiningHall[] = ['alley', 'c4c', 'libby', 'seec', 'sewall', 'village_center']

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
