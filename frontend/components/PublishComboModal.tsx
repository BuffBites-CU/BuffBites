// components/PublishComboModal.tsx
// "use client"
// Multi-step modal for submitting a new community combo.
// Opened from the "Share Combo" button on the Community page.
//
// PROPS
//   onClose    — () => void
//   onSuccess  — () => void  (called after successful publish — parent should refetch feed)
//
// INTERNAL STATE
//   step        — 1 | 2 | 3  (current step in the form)
//   formData    — Partial<ComboCreate> built up across steps
//   submitting  — boolean (true while POST is in flight)
//   error       — string | null
//
// STEP 1 — Context
//   Heading: "Where and when?"
//   Dining hall dropdown: select from the 5 halls (use DINING_HALL_LABELS for labels)
//   Date picker: defaults to today, cannot pick future dates
//   "Next →" button — validates both fields are filled before proceeding
//
// STEP 2 — Build Your Combo
//   Heading: "What did you make?"
//   Combo title input (required, max 60 chars, show char counter)
//   Description textarea (optional, max 200 chars)
//   Tags: multi-select chip row (vegan, vegetarian, high-protein, light, hearty, balanced)
//   Dishes section:
//     Dynamic list — starts with 2 empty dish rows
//     Each row: [Dish name input] [Station input] [Servings number input] [Remove ✕ button]
//     "Add dish +" button appends a new empty row
//     Minimum 1 dish required to proceed
//     Max 8 dishes (enforce in UI)
//   Notes textarea (optional, max 300 chars)
//   "Next →" and "← Back" buttons
//
// STEP 3 — Photos (optional)
//   Heading: "Add photos (optional)"
//   Subtext: "Show others what your combo looks like — max 3 photos"
//   Image upload area: tap to open file picker, accept image/*
//   Preview thumbnails shown after selection (3 max, show warning if user tries to add more)
//   Images should be uploaded to storage here and the resulting URL stored in formData.images
//   "Publish" button + "← Back" button
//   On click: call publishCombo(formData, firebaseUid, username) from communityService
//     On success: call onSuccess(), call onClose()
//     On error: show error message inside the modal, do not close
//
// LAYOUT
//   Full-screen overlay (fixed inset-0, bg-black/50, z-50)
//   White sheet slides up from bottom (rounded-t-2xl)
//   Step indicator dots at top: 3 dots, filled = current/past step
//   Max height: 90vh, overflow-y-auto
//   Submit/Next buttons: full-width, brand-gold, at the bottom of the sheet
