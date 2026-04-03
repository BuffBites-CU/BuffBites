// types/index.ts
// Single source of truth for all TypeScript types used across the app.
// Import from "@/types" everywhere — never define inline types in components.
//
// ─── Users ───────────────────────────────────────────────────────────────────
//
// DietaryPreference
//   Union type: "vegan" | "vegetarian" | "gluten-free" | "halal"
//
// UserCreate
//   Shape of the body sent to POST /api/users/
//   Fields: firebase_uid, username, email, dietary_preferences, avatar_url (optional)
//
// UserResponse
//   Extends UserCreate. Adds: id (MongoDB _id as string), karma (number), created_at (ISO string)
//
// ─── AI Combos ───────────────────────────────────────────────────────────────
//
// DiningHall
//   Union type of the 5 slugs the backend accepts:
//   "alley" | "c4c" | "libby" | "sewall" | "village_center"
//
// DINING_HALL_LABELS
//   Record<DiningHall, string> — maps slugs to display names shown in UI
//   e.g. "c4c" → "C4C", "village_center" → "Village Center"
//
// MealPeriod
//   "Breakfast" | "Lunch" | "Dinner"
//
// ComboTag
//   "vegan" | "vegetarian" | "high-protein" | "light" | "hearty" | "balanced"
//
// Dish
//   { name: string; station: string }
//   Represents one item inside an AI-generated combo
//
// Combo
//   { title, description, dishes: Dish[], approximate_calories, tags: ComboTag[] }
//   One AI-generated combo for a single meal period
//
// CombosMap
//   { Breakfast: Combo[]; Lunch: Combo[]; Dinner: Combo[] }
//   Always exactly 3 combos per period
//
// ComboResponse
//   { dining_location, date, day_of_week, combos: CombosMap }
//   Full response from GET /api/combos/generate
//
// ─── Community Combos ─────────────────────────────────────────────────────────
//
// DishItem
//   { name: string; station: string; servings: number }
//   Dish inside a user-submitted combo — includes servings count
//
// ComboCreate
//   Body sent to POST /api/community/combos
//   Fields: title, dining_hall, date, dishes: DishItem[], tags, description?, images[], notes?
//
// CommunityCombo
//   Extends ComboCreate. Adds: id, upvotes, downvotes, author_username,
//   author_firebase_uid, created_at, expires_at (all ISO strings from MongoDB)
//
// VoteType
//   "upvote" | "downvote"
