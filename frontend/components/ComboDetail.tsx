// components/ComboDetail.tsx
// "use client"
// Bottom sheet modal shown when a combo card is clicked.
// Works for both AI-generated combos and community combos.
//
// PROPS
//   combo       — Combo | CommunityCombo | null
//   type        — "ai" | "community"
//   onClose     — () => void
//
// BEHAVIOR
//   For community combos: on mount, call getCombo(combo.id) to load full detail
//   (the feed endpoint may not include all fields — this ensures notes/images load)
//   Show a loading spinner inside the sheet while fetching.
//
// LAYOUT
//   Overlay: semi-transparent black backdrop (bg-black/40), clicking it calls onClose
//   Sheet: slides up from bottom (translate-y animation), white, rounded-t-2xl
//   Max height: 85vh, overflow-y-auto
//
//   Inside the sheet (top to bottom):
//     1. Drag handle (small gray bar at top center)
//
//     2. Title (text-xl font-bold) + close button (X) top-right
//
//     3. Meta row: dining hall badge, date, author @username (community only)
//
//     4. Description paragraph (full text, no clamp)
//
//     5. Tags row — same colored chips as ComboCard
//
//     6. "Dishes" section heading
//        For each dish:
//          - Name (font-medium) | Station (muted small text) | Servings (community only)
//          Rendered as a clean list with dividers
//
//     7. Nutrition summary (AI combos):
//        "~{approximate_calories} calories" shown in a highlighted row
//
//     8. VoteButtons component (community combos only)
//        Shown at the bottom of the sheet, sticky so it's always visible
//
//     9. Photos row (community combos only, if images.length > 0)
//        Horizontal scrollable row of image thumbnails
//        Tap to view full-size (simple lightbox or new tab)
//
//     10. Notes (community combos only, if notes exists)
//         Gray italic block quote
