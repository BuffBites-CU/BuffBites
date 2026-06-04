'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { getUser, updateUser, deleteMeal } from '@/services/usersService'
import { getUserCombos, deleteCombo } from '@/services/communityService'
import { PencilIcon, CheckIcon, XMarkIcon, StarIcon, TrashIcon, ClockIcon, ChevronUpIcon, ChevronDownIcon } from '@/components/icons'
import { DINING_HALLS, DINING_HALL_LABELS } from '@/types'
import EditComboModal from '@/components/EditComboModal'
import type { DietaryPreference, DiningHall, NutritionGoals, UserResponse, CommunityCombo, MealLogEntry } from '@/types'

/* ── Constants ─────────────────────────────────────────────────── */

const DIETARY_OPTIONS: { key: DietaryPreference; label: string; style: string }[] = [
  { key: 'vegan',       label: 'Vegan',       style: 'bg-emerald-100 text-emerald-800' },
  { key: 'vegetarian',  label: 'Vegetarian',  style: 'bg-green-100 text-green-800' },
  { key: 'gluten-free', label: 'Gluten-Free', style: 'bg-yellow-100 text-yellow-800' },
  { key: 'halal',       label: 'Halal',       style: 'bg-indigo-100 text-indigo-800' },
]

const DIETARY_FOCUS_OPTIONS: { key: NonNullable<NutritionGoals['dietary_focus']>; label: string; icon: string; desc: string }[] = [
  { key: 'balanced',    label: 'Balanced',     icon: '⚖️', desc: 'Varied macros' },
  { key: 'high-protein',label: 'High Protein', icon: '💪', desc: 'Maximize protein' },
  { key: 'low-carb',    label: 'Low Carb',     icon: '🥩', desc: 'Minimal carbs' },
  { key: 'weight-loss', label: 'Weight Loss',  icon: '📉', desc: 'Low calorie density' },
  { key: 'muscle-gain', label: 'Muscle Gain',  icon: '🏋️', desc: 'Protein + carbs surplus' },
  { key: 'endurance',   label: 'Endurance',    icon: '🏃', desc: 'Complex carbs + protein' },
]

const PRIORITY_NUTRIENTS: { key: string; label: string; icon: string }[] = [
  { key: 'iron',      label: 'Iron',       icon: '🩸' },
  { key: 'calcium',   label: 'Calcium',    icon: '🦷' },
  { key: 'vitamin-d', label: 'Vitamin D',  icon: '☀️' },
  { key: 'fiber',     label: 'Fiber',      icon: '🌾' },
  { key: 'omega-3',   label: 'Omega-3',    icon: '🐟' },
  { key: 'b12',       label: 'B12',        icon: '🧠' },
  { key: 'zinc',      label: 'Zinc',       icon: '⚡' },
]

/* ── Pure helpers ───────────────────────────────────────────────── */

function todayISO() { return new Date().toISOString().split('T')[0] }

function isoOffset(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function formatDateLabel(iso: string): string {
  const today = todayISO()
  const yesterday = isoOffset(-1)
  if (iso === today) return 'Today'
  if (iso === yesterday) return 'Yesterday'
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatExpiry(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', urgent: true }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return { text: h > 0 ? `${h}h ${m}m left` : `${m}m left`, urgent: h < 1 }
}

function karmaLabel(karma: number): string {
  if (karma >= 200) return 'Top Contributor'
  if (karma >= 50)  return 'Rising Star'
  if (karma >= 10)  return 'Regular'
  return 'Getting Started'
}

function computeStreak(mealLog: MealLogEntry[]): number {
  const dates = [...new Set(mealLog.map((e) => e.date))].sort().reverse()
  if (dates.length === 0) return 0
  if (dates[0] !== todayISO() && dates[0] !== isoOffset(-1)) return 0
  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]).getTime()
    const curr = new Date(dates[i]).getTime()
    if ((prev - curr) / 86_400_000 === 1) streak++
    else break
  }
  return streak
}

interface Badge { id: string; icon: string; label: string; desc: string }

function computeBadges(profile: UserResponse, streak: number): Badge[] {
  const log = profile.meal_log ?? []
  const halls = new Set(log.map((e) => e.dining_hall)).size
  const badges: Badge[] = []
  if (log.length >= 1)     badges.push({ id: 'first_bite',  icon: '🍽', label: 'First Bite',      desc: 'Logged your first meal' })
  if (streak >= 3)         badges.push({ id: 'streak_3',    icon: '🔥', label: '3-Day Streak',    desc: '3 days in a row' })
  if (streak >= 7)         badges.push({ id: 'streak_7',    icon: '⚡', label: 'Week Warrior',    desc: '7-day streak' })
  if (profile.karma >= 10) badges.push({ id: 'rising',      icon: '⭐', label: 'Rising Star',     desc: '10 karma earned' })
  if (profile.karma >= 50) badges.push({ id: 'community',   icon: '🌟', label: 'Community Star',  desc: '50 karma earned' })
  if (halls >= 3)          badges.push({ id: 'explorer',    icon: '🗺', label: 'Hall Explorer',   desc: 'Ate at 3+ halls' })
  if (log.length >= 20)    badges.push({ id: 'regular',     icon: '🦬', label: 'Buff Regular',    desc: '20 meals logged' })
  return badges
}

/** Group meal log entries by date, descending */
function groupByDate(mealLog: MealLogEntry[]): { date: string; entries: MealLogEntry[]; total: number }[] {
  const map = new Map<string, MealLogEntry[]>()
  for (const e of mealLog) {
    const arr = map.get(e.date) ?? []
    arr.push(e)
    map.set(e.date, arr)
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a > b ? -1 : 1))
    .map(([date, entries]) => ({ date, entries, total: entries.reduce((s, e) => s + e.calories, 0) }))
}

function getWeekData(mealLog: MealLogEntry[]) {
  return Array.from({ length: 7 }, (_, i) => {
    const iso = isoOffset(i - 6)
    const d = new Date(iso + 'T12:00:00')
    const label = i === 6 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3)
    const calories = mealLog.filter((e) => e.date === iso).reduce((s, e) => s + e.calories, 0)
    return { iso, label, calories }
  })
}

/* ── Sub-components ─────────────────────────────────────────────── */

function StatPill({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5 py-3">
      <span className="text-xl leading-none">{icon}</span>
      <span className="font-display font-bold text-brand-black text-lg leading-none">{value}</span>
      <span className="text-[10px] text-muted uppercase tracking-wider font-display">{label}</span>
    </div>
  )
}

function WeeklyChart({ mealLog, goalPerMeal }: { mealLog: MealLogEntry[]; goalPerMeal?: number }) {
  const data = getWeekData(mealLog)
  const dailyGoal = goalPerMeal ? goalPerMeal * 3 : null
  const maxCal = Math.max(...data.map((d) => d.calories), dailyGoal ?? 0, 100)
  const BAR_H = 72
  const today = todayISO()

  return (
    <div className="bg-surface-card rounded-2xl border border-surface-overlay p-4">
      <div className="flex items-end justify-between gap-1 h-20 relative">
        {dailyGoal && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-brand-gold/50 pointer-events-none z-10"
            style={{ bottom: `${(dailyGoal / maxCal) * BAR_H}px` }}
          />
        )}
        {data.map(({ iso, label, calories }) => {
          const isToday = iso === today
          const pct = calories > 0 ? Math.max((calories / maxCal) * BAR_H, 5) : 0
          const overGoal = !!(dailyGoal && calories > dailyGoal)
          return (
            <div key={iso} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex items-end justify-center" style={{ height: BAR_H }}>
                <div
                  className={`w-full rounded-t transition-all duration-500 ${
                    calories === 0 ? 'bg-surface-overlay rounded' :
                    overGoal ? 'bg-amber-400' :
                    isToday ? 'bg-brand-gold' : 'bg-brand-gold/45'
                  }`}
                  style={{ height: calories === 0 ? 3 : pct }}
                />
              </div>
              <span className={`text-[9px] font-display font-semibold uppercase tracking-wide leading-none ${isToday ? 'text-brand-gold' : 'text-muted'}`}>{label}</span>
              {calories > 0 && <span className="text-[8px] text-muted leading-none">{calories}</span>}
            </div>
          )
        })}
      </div>
      {dailyGoal && <p className="text-[10px] text-muted mt-2 text-right">— {dailyGoal} cal/day goal</p>}
    </div>
  )
}

function MealHistoryDay({
  date, entries, total, goalPerMeal, onDelete,
}: {
  date: string; entries: MealLogEntry[]; total: number; goalPerMeal?: number
  onDelete: (logged_at: string) => void
}) {
  const [open, setOpen] = useState(date === todayISO())
  const isToday = date === todayISO()
  const pct = goalPerMeal ? Math.min(Math.round((total / (goalPerMeal * 3)) * 100), 100) : null

  return (
    <div className="bg-surface-card rounded-2xl border border-surface-overlay overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-overlay/40 transition-colors"
      >
        {/* Date badge */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${isToday ? 'bg-brand-gold' : 'bg-surface-overlay'}`}>
          <span className={`text-xs font-display font-bold ${isToday ? 'text-brand-black' : 'text-muted'}`}>
            {new Date(date + 'T12:00:00').getDate()}
          </span>
        </div>

        <div className="flex-1 min-w-0 text-left">
          <p className={`text-sm font-display font-bold ${isToday ? 'text-brand-gold' : 'text-brand-black'}`}>
            {formatDateLabel(date)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted">{entries.length} meal{entries.length !== 1 ? 's' : ''}</span>
            {pct !== null && (
              <div className="flex-1 h-1 bg-surface-warm rounded-full overflow-hidden max-w-[60px]">
                <div
                  className={`h-full rounded-full ${pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-brand-gold'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-display font-bold text-brand-gold text-sm">{total} cal</span>
          {open ? (
            <ChevronUpIcon width={14} height={14} className="text-muted" />
          ) : (
            <ChevronDownIcon width={14} height={14} className="text-muted" />
          )}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-surface-overlay border-t border-surface-overlay">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 group">
              <div className="w-2 h-2 rounded-full bg-brand-gold/60 flex-shrink-0 ml-1" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-semibold text-brand-black line-clamp-1">{entry.title}</p>
                <p className="text-[11px] text-muted mt-0.5 capitalize">
                  {entry.meal_period} · {DINING_HALL_LABELS[entry.dining_hall as DiningHall] ?? entry.dining_hall}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs font-semibold text-brand-gold">{entry.calories} cal</span>
                  {entry.protein_g != null && entry.protein_g > 0 && (
                    <span className="text-[10px] text-muted">{entry.protein_g}g protein</span>
                  )}
                </div>
                <button
                  onClick={() => onDelete(entry.logged_at)}
                  className="opacity-0 group-hover:opacity-100 active:opacity-100 p-1.5 rounded-full hover:bg-red-50 transition-all"
                  aria-label="Remove meal"
                >
                  <XMarkIcon width={13} height={13} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────────────── */

export default function ProfilePage() {
  const router = useRouter()
  const { firebaseUser, firebaseUid, signOut, setDefaultDiningHall: setCtxHall } = useAuth()
  const { showToast } = useToast()

  const [profile, setProfile] = useState<UserResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState({
    username: '',
    dietary_preferences: [] as DietaryPreference[],
    preferred_calories_per_meal: '' as string,
    default_dining_hall: '' as string,
    nutrition_goals: {
      protein_g_per_meal: '' as string,
      dietary_focus: '' as string,
      priority_nutrients: [] as string[],
    },
  })
  const [saving, setSaving] = useState(false)
  const [usernameError, setUsernameError] = useState('')
  const [historyLimit, setHistoryLimit] = useState(7)
  const [deletingMeal, setDeletingMeal] = useState<string | null>(null)

  const [myCombos, setMyCombos] = useState<CommunityCombo[]>([])
  const [combosLoading, setCombosLoading] = useState(false)
  const [editingCombo, setEditingCombo] = useState<CommunityCombo | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseUid) { router.replace('/'); return }
    getUser(firebaseUid).then(setProfile).catch(() => router.replace('/')).finally(() => setLoading(false))
  }, [firebaseUid, router])

  useEffect(() => {
    if (!firebaseUid) return
    setCombosLoading(true)
    getUserCombos(firebaseUid).then(setMyCombos).catch(() => setMyCombos([])).finally(() => setCombosLoading(false))
  }, [firebaseUid])

  function enterEdit() {
    if (!profile) return
    setDraft({
      username: profile.username,
      dietary_preferences: [...profile.dietary_preferences],
      preferred_calories_per_meal: profile.preferred_calories_per_meal != null ? String(profile.preferred_calories_per_meal) : '',
      default_dining_hall: profile.default_dining_hall ?? '',
      nutrition_goals: {
        protein_g_per_meal: profile.nutrition_goals?.protein_g_per_meal != null ? String(profile.nutrition_goals.protein_g_per_meal) : '',
        dietary_focus: profile.nutrition_goals?.dietary_focus ?? '',
        priority_nutrients: [...(profile.nutrition_goals?.priority_nutrients ?? [])],
      },
    })
    setUsernameError('')
    setEditMode(true)
  }

  function togglePref(pref: DietaryPreference) {
    setDraft((d) => ({
      ...d,
      dietary_preferences: d.dietary_preferences.includes(pref)
        ? d.dietary_preferences.filter((p) => p !== pref)
        : [...d.dietary_preferences, pref],
    }))
  }

  async function handleSave() {
    if (!firebaseUid || !profile) return
    if (!draft.username.trim() || draft.username.length < 3) { setUsernameError('Username must be at least 3 characters.'); return }
    setSaving(true)
    const parsedCal = draft.preferred_calories_per_meal !== '' ? parseInt(draft.preferred_calories_per_meal, 10) : undefined
    const newHall = draft.default_dining_hall || null
    const parsedProtein = draft.nutrition_goals.protein_g_per_meal !== '' ? parseInt(draft.nutrition_goals.protein_g_per_meal, 10) : undefined
    const newGoals: NutritionGoals | null = (parsedProtein || draft.nutrition_goals.dietary_focus || draft.nutrition_goals.priority_nutrients.length > 0)
      ? {
          protein_g_per_meal: parsedProtein,
          dietary_focus: (draft.nutrition_goals.dietary_focus as NutritionGoals['dietary_focus']) || undefined,
          priority_nutrients: draft.nutrition_goals.priority_nutrients,
        }
      : null

    const changes: Record<string, unknown> = {}
    if (draft.username !== profile.username) changes.username = draft.username
    if (JSON.stringify(draft.dietary_preferences) !== JSON.stringify(profile.dietary_preferences)) changes.dietary_preferences = draft.dietary_preferences
    if (parsedCal !== profile.preferred_calories_per_meal) changes.preferred_calories_per_meal = parsedCal ?? null
    if (newHall !== (profile.default_dining_hall ?? null)) changes.default_dining_hall = newHall
    if (JSON.stringify(newGoals) !== JSON.stringify(profile.nutrition_goals ?? null)) changes.nutrition_goals = newGoals

    try {
      await updateUser(firebaseUid, changes as Parameters<typeof updateUser>[1])
      setProfile((p) => p ? { ...p, ...changes, preferred_calories_per_meal: parsedCal ?? undefined, default_dining_hall: newHall ?? undefined, nutrition_goals: newGoals ?? undefined } : p)
      if (newHall !== (profile.default_dining_hall ?? null)) setCtxHall(newHall)
      setEditMode(false)
      showToast('Profile updated!', 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('username')) setUsernameError('That username is already taken.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteMeal(logged_at: string) {
    if (!firebaseUid || deletingMeal) return
    setDeletingMeal(logged_at)
    // Optimistic update
    setProfile((p) => p ? { ...p, meal_log: (p.meal_log ?? []).filter((e) => e.logged_at !== logged_at) } : p)
    try {
      await deleteMeal(firebaseUid, logged_at)
    } catch {
      // Roll back on failure by refetching
      getUser(firebaseUid).then(setProfile).catch(() => {})
      showToast('Failed to remove meal', 'error')
    } finally {
      setDeletingMeal(null)
    }
  }

  async function handleDelete(combo: CommunityCombo) {
    if (!firebaseUser) return
    setConfirmDeleteId(null)
    setDeletingId(combo.id)
    try {
      const token = await firebaseUser.getIdToken()
      await deleteCombo(combo.id, token)
      setMyCombos((prev) => prev.filter((c) => c.id !== combo.id))
      showToast('Combo deleted.', 'neutral')
    } catch { showToast('Failed to delete.', 'error') }
    finally { setDeletingId(null) }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-brand-gold" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (!profile) return null

  const mealLog = profile.meal_log ?? []
  const streak = computeStreak(mealLog)
  const badges = computeBadges(profile, streak)
  const totalMeals = mealLog.length
  const thisWeekCal = getWeekData(mealLog).reduce((s, d) => s + d.calories, 0)
  const historyGroups = groupByDate(mealLog)
  const visibleGroups = historyGroups.slice(0, historyLimit)

  return (
    <div className="min-h-screen bg-surface pb-28">

      {/* ── Hero header card ───────────────────────────────────── */}
      <div className="bg-brand-black px-4 pt-14 pb-6">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-brand-gold/40 flex-shrink-0">
              {firebaseUser?.photoURL ? (
                <Image src={firebaseUser.photoURL} alt="Profile" fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-brand-gold/20">
                  <span className="text-2xl font-display font-bold text-brand-gold">{profile.username[0]?.toUpperCase()}</span>
                </div>
              )}
            </div>

            {/* Name + karma */}
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-white text-xl tracking-tight leading-none">@{profile.username}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-brand-gold font-display font-semibold">
                  <StarIcon width={12} height={12} className="fill-brand-gold" />
                  {profile.karma} karma
                </span>
                <span className="text-[10px] text-brand-stone">· {karmaLabel(profile.karma)}</span>
                {streak > 0 && (
                  <span className="text-[10px] font-display font-semibold text-amber-400 bg-amber-400/15 rounded-full px-2 py-0.5">
                    🔥 {streak}-day streak
                  </span>
                )}
              </div>
            </div>

            {/* Edit button */}
            {!editMode && (
              <button
                onClick={enterEdit}
                className="flex-shrink-0 w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <PencilIcon width={14} height={14} className="text-white" />
              </button>
            )}
          </div>

          {/* Stats row */}
          <div className="mt-5 bg-white/8 rounded-2xl divide-x divide-white/10 flex overflow-hidden">
            <StatPill icon="🍽" value={totalMeals} label="Meals" />
            <StatPill icon="🔥" value={`${thisWeekCal}`} label="Cal/wk" />
            <StatPill icon="📮" value={myCombos.length} label="Shared" />
            <StatPill icon="⭐" value={profile.karma} label="Karma" />
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6 pt-6">

        {/* ── Edit form (shown in place of settings card) ────── */}
        {editMode && (
          <div className="bg-surface-card rounded-3xl border border-surface-overlay shadow-card-sm p-5 space-y-5">
            <h2 className="font-display font-bold text-brand-black text-base">Edit Profile</h2>

            <div>
              <label className="text-xs font-display font-semibold text-muted uppercase tracking-wider block mb-1.5">Username</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm">@</span>
                <input
                  value={draft.username}
                  onChange={(e) => { setDraft((d) => ({ ...d, username: e.target.value })); setUsernameError('') }}
                  maxLength={20}
                  className="w-full rounded-xl border border-surface-warm pl-8 pr-4 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold bg-surface"
                />
              </div>
              {usernameError && <p className="text-xs text-red-500 mt-1">{usernameError}</p>}
            </div>

            <div>
              <label className="text-xs font-display font-semibold text-muted uppercase tracking-wider block mb-2">Dietary Preferences</label>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map(({ key, label, style }) => (
                  <button key={key} onClick={() => togglePref(key)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-all ${draft.dietary_preferences.includes(key) ? `${style} border-transparent` : 'bg-surface-overlay text-muted border-transparent'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-display font-semibold text-muted uppercase tracking-wider block mb-2">Default Dining Hall</label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setDraft((d) => ({ ...d, default_dining_hall: '' }))}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${draft.default_dining_hall === '' ? 'bg-brand-black text-brand-gold' : 'bg-surface-overlay text-muted'}`}>
                  None
                </button>
                {DINING_HALLS.map((hall) => (
                  <button key={hall} onClick={() => setDraft((d) => ({ ...d, default_dining_hall: hall }))}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${draft.default_dining_hall === hall ? 'bg-brand-black text-brand-gold' : 'bg-surface-overlay text-muted'}`}>
                    {DINING_HALL_LABELS[hall]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-display font-semibold text-muted uppercase tracking-wider block mb-1.5">Calorie Goal per Meal</label>
              <div className="relative">
                <input type="number" min={100} max={3000} placeholder="e.g. 700"
                  value={draft.preferred_calories_per_meal}
                  onChange={(e) => setDraft((d) => ({ ...d, preferred_calories_per_meal: e.target.value }))}
                  className="w-full rounded-xl border border-surface-warm px-4 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold bg-surface" />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-xs">cal</span>
              </div>
            </div>

            {/* Nutrition Goals */}
            <div className="space-y-4 pt-1 border-t border-surface-warm">
              <p className="text-xs font-display font-semibold text-brand-black uppercase tracking-wider mt-1">Nutrition Goals</p>

              {/* Dietary Focus */}
              <div>
                <label className="text-xs font-display font-semibold text-muted uppercase tracking-wider block mb-2">Dietary Focus</label>
                <div className="grid grid-cols-3 gap-2">
                  {DIETARY_FOCUS_OPTIONS.map(({ key, label, icon, desc }) => (
                    <button key={key}
                      onClick={() => setDraft((d) => ({ ...d, nutrition_goals: { ...d.nutrition_goals, dietary_focus: d.nutrition_goals.dietary_focus === key ? '' : key } }))}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all ${
                        draft.nutrition_goals.dietary_focus === key
                          ? 'bg-brand-black border-brand-black text-brand-gold'
                          : 'bg-surface-overlay border-transparent text-muted hover:bg-surface-warm'
                      }`}>
                      <span className="text-lg leading-none">{icon}</span>
                      <span className="text-[10px] font-display font-semibold leading-tight">{label}</span>
                      <span className="text-[9px] opacity-70 leading-tight">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Protein Goal */}
              <div>
                <label className="text-xs font-display font-semibold text-muted uppercase tracking-wider block mb-1.5">Protein Goal per Meal</label>
                <div className="relative">
                  <input type="number" min={0} max={200} placeholder="e.g. 35"
                    value={draft.nutrition_goals.protein_g_per_meal}
                    onChange={(e) => setDraft((d) => ({ ...d, nutrition_goals: { ...d.nutrition_goals, protein_g_per_meal: e.target.value } }))}
                    className="w-full rounded-xl border border-surface-warm px-4 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold bg-surface" />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-xs">g</span>
                </div>
              </div>

              {/* Priority Nutrients */}
              <div>
                <label className="text-xs font-display font-semibold text-muted uppercase tracking-wider block mb-2">Priority Nutrients</label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITY_NUTRIENTS.map(({ key, label, icon }) => {
                    const selected = draft.nutrition_goals.priority_nutrients.includes(key)
                    return (
                      <button key={key}
                        onClick={() => setDraft((d) => {
                          const prev = d.nutrition_goals.priority_nutrients
                          return { ...d, nutrition_goals: { ...d.nutrition_goals, priority_nutrients: selected ? prev.filter((n) => n !== key) : [...prev, key] } }
                        })}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                          selected ? 'bg-brand-black text-brand-gold' : 'bg-surface-overlay text-muted'
                        }`}>
                        <span>{icon}</span>{label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-muted mt-1.5">Claude will prioritize these nutrients when building your combos</p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditMode(false)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-surface-warm text-sm text-muted hover:bg-surface-overlay transition-colors">
                <XMarkIcon width={16} height={16} /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-gold text-brand-black text-sm font-display font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity">
                <CheckIcon width={16} height={16} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* ── Badges ──────────────────────────────────────────── */}
        {badges.length > 0 && (
          <div>
            <h2 className="text-base font-display font-bold text-brand-black mb-3">Achievements</h2>
            <div className="grid grid-cols-4 gap-2">
              {badges.map((b) => (
                <div key={b.id} title={b.desc}
                  className="flex flex-col items-center gap-1 bg-surface-card border border-surface-overlay rounded-2xl py-3 px-1 shadow-card-sm">
                  <span className="text-2xl leading-none">{b.icon}</span>
                  <span className="text-[9px] font-display font-semibold text-brand-black text-center leading-tight">{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Nutrition Goals summary (view mode) ─────────────── */}
        {!editMode && profile.nutrition_goals && (
          <div>
            <h2 className="text-base font-display font-bold text-brand-black mb-3">Nutrition Goals</h2>
            <div className="bg-surface-card rounded-2xl border border-surface-overlay p-4 space-y-3">
              {profile.nutrition_goals.dietary_focus && (() => {
                const opt = DIETARY_FOCUS_OPTIONS.find((o) => o.key === profile.nutrition_goals?.dietary_focus)
                return (
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{opt?.icon}</span>
                    <div>
                      <p className="text-sm font-display font-semibold text-brand-black">{opt?.label ?? profile.nutrition_goals.dietary_focus}</p>
                      <p className="text-[11px] text-muted">{opt?.desc}</p>
                    </div>
                  </div>
                )
              })()}

              {profile.nutrition_goals.protein_g_per_meal && (() => {
                const todayProtein = mealLog.filter((e) => e.date === todayISO()).reduce((s, e) => s + (e.protein_g ?? 0), 0)
                const goal = profile.nutrition_goals.protein_g_per_meal
                const mealsToday = mealLog.filter((e) => e.date === todayISO()).length
                const dailyGoal = goal * 3
                const pct = Math.min(Math.round((todayProtein / dailyGoal) * 100), 100)
                return (
                  <div>
                    <div className="flex items-end justify-between mb-1.5">
                      <span className="text-xs font-display font-semibold text-muted uppercase tracking-wider">Protein Today</span>
                      <span className="text-xs text-muted">{goal}g/meal goal</span>
                    </div>
                    <div className="flex items-end justify-between mb-1">
                      <span className="font-display font-bold text-brand-black text-lg">{todayProtein}g</span>
                      <span className="text-xs text-muted">/ {dailyGoal}g daily</span>
                    </div>
                    <div className="h-2 bg-surface-overlay rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-400' : pct >= 66 ? 'bg-brand-gold' : 'bg-brand-gold/50'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    {mealsToday === 0 && <p className="text-[11px] text-muted mt-1">Log meals to track protein</p>}
                  </div>
                )
              })()}

              {(profile.nutrition_goals.priority_nutrients ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-display font-semibold text-muted uppercase tracking-wider mb-2">Priority Nutrients</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(profile.nutrition_goals.priority_nutrients ?? []).map((n) => {
                      const opt = PRIORITY_NUTRIENTS.find((o) => o.key === n)
                      return (
                        <span key={n} className="flex items-center gap-1 bg-brand-black text-brand-gold rounded-full px-2.5 py-1 text-xs font-medium">
                          <span>{opt?.icon}</span>{opt?.label ?? n}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Calorie summary ──────────────────────────────────── */}
        {(mealLog.length > 0 || profile.preferred_calories_per_meal) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-display font-bold text-brand-black">Calorie Tracker</h2>
              {profile.preferred_calories_per_meal && (
                <span className="text-xs text-muted">{profile.preferred_calories_per_meal} cal/meal goal</span>
              )}
            </div>

            {/* Today */}
            {(() => {
              const todayMeals = mealLog.filter((e) => e.date === todayISO())
              const todayCal = todayMeals.reduce((s, e) => s + e.calories, 0)
              const pct = profile.preferred_calories_per_meal
                ? Math.min(Math.round((todayCal / (profile.preferred_calories_per_meal * 3)) * 100), 100)
                : null
              return (
                <div className="bg-surface-card rounded-2xl border border-surface-overlay p-4 mb-2">
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <span className="font-display font-bold text-2xl text-brand-black">{todayCal}</span>
                      {profile.preferred_calories_per_meal && (
                        <span className="text-sm text-muted ml-1.5">/ {profile.preferred_calories_per_meal * 3} cal today</span>
                      )}
                    </div>
                    <span className="text-xs text-muted">{todayMeals.length} meal{todayMeals.length !== 1 ? 's' : ''} logged</span>
                  </div>
                  {pct !== null && (
                    <div className="h-2 bg-surface-overlay rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-brand-gold'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              )
            })()}

            <WeeklyChart mealLog={mealLog} goalPerMeal={profile.preferred_calories_per_meal} />
          </div>
        )}

        {/* ── Meal History ─────────────────────────────────────── */}
        {historyGroups.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-display font-bold text-brand-black">Meal History</h2>
              <span className="text-xs text-muted">{historyGroups.length} day{historyGroups.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-2">
              {visibleGroups.map(({ date, entries, total }) => (
                <MealHistoryDay
                  key={date}
                  date={date}
                  entries={entries}
                  total={total}
                  goalPerMeal={profile.preferred_calories_per_meal}
                  onDelete={handleDeleteMeal}
                />
              ))}
            </div>
            {historyGroups.length > historyLimit && (
              <button
                onClick={() => setHistoryLimit((l) => l + 7)}
                className="w-full mt-3 py-2.5 rounded-xl border border-surface-warm text-sm text-muted font-display font-semibold hover:bg-surface-overlay transition-colors"
              >
                Show {Math.min(7, historyGroups.length - historyLimit)} more days
              </button>
            )}
          </div>
        )}

        {/* ── Saved Combos ─────────────────────────────────────── */}
        {(profile.favorites ?? []).length > 0 && (
          <div>
            <h2 className="text-base font-display font-bold text-brand-black mb-3">Saved Combos</h2>
            <div className="space-y-2">
              {(profile.favorites ?? []).slice().reverse().map((fav, i) => (
                <div key={i} className="bg-surface-card rounded-xl border border-surface-overlay p-4 flex items-start gap-3">
                  <span className="text-red-400 mt-0.5 flex-shrink-0 text-base">♥</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-semibold text-sm text-brand-black line-clamp-1">{fav.title}</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      {DINING_HALL_LABELS[fav.dining_hall as DiningHall] ?? fav.dining_hall} · {fav.date}
                      {fav.approximate_calories ? ` · ~${fav.approximate_calories} cal` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Settings ─────────────────────────────────────────── */}
        {!editMode && (
          <div className="bg-surface-card rounded-3xl border border-surface-overlay shadow-card-sm overflow-hidden">
            {profile.dietary_preferences.length > 0 && (
              <div className="px-5 py-4 border-b border-surface-overlay">
                <p className="text-xs font-display font-semibold text-muted uppercase tracking-wider mb-2">Dietary Preferences</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.dietary_preferences.map((pref) => {
                    const opt = DIETARY_OPTIONS.find((o) => o.key === pref)
                    return <span key={pref} className={`rounded-full px-3 py-1 text-sm font-medium ${opt?.style ?? 'bg-surface-overlay text-muted'}`}>{opt?.label ?? pref}</span>
                  })}
                </div>
              </div>
            )}
            {profile.default_dining_hall && (
              <div className="px-5 py-4 border-b border-surface-overlay flex items-center justify-between">
                <p className="text-xs font-display font-semibold text-muted uppercase tracking-wider">Default Hall</p>
                <p className="text-sm font-medium text-brand-black">{DINING_HALL_LABELS[profile.default_dining_hall as DiningHall] ?? profile.default_dining_hall}</p>
              </div>
            )}
            {profile.preferred_calories_per_meal != null && (
              <div className="px-5 py-4 border-b border-surface-overlay flex items-center justify-between">
                <p className="text-xs font-display font-semibold text-muted uppercase tracking-wider">Calorie Goal</p>
                <p className="text-sm font-medium text-brand-black">{profile.preferred_calories_per_meal} cal/meal</p>
              </div>
            )}
            <button onClick={signOut} className="w-full px-5 py-4 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors text-left">
              Sign Out
            </button>
          </div>
        )}

        {/* ── My Published Combos ──────────────────────────────── */}
        <div>
          <h2 className="text-base font-display font-bold text-brand-black mb-3">My Combos</h2>

          {combosLoading && (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="bg-surface-card rounded-xl border border-surface-overlay p-4 animate-pulse">
                  <div className="h-4 bg-surface-warm rounded-full w-1/2 mb-2" />
                  <div className="h-3 bg-surface-warm rounded-full w-1/3" />
                </div>
              ))}
            </div>
          )}

          {!combosLoading && myCombos.length === 0 && (
            <div className="bg-surface-card rounded-xl border border-surface-overlay px-5 py-8 text-center space-y-3">
              <p className="text-sm text-muted">You haven&apos;t shared any combos yet.</p>
              <Link href="/community" className="inline-block px-4 py-2 rounded-xl bg-brand-gold text-brand-black text-sm font-display font-semibold hover:opacity-90 transition-opacity">
                Share your first combo →
              </Link>
            </div>
          )}

          {!combosLoading && myCombos.length > 0 && (
            <div className="space-y-2">
              {myCombos.map((combo) => {
                const expiry = formatExpiry(combo.expires_at)
                return (
                  <div key={combo.id} className="bg-surface-card rounded-xl border border-surface-overlay overflow-hidden">
                    <div className="flex">
                      <div className="w-1 bg-brand-gold flex-shrink-0" />
                      <div className="flex items-start justify-between gap-3 flex-1 p-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-display font-semibold text-sm text-brand-black line-clamp-1">{combo.title}</p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-xs text-muted">{combo.dishes.length} dishes · {DINING_HALL_LABELS[combo.dining_hall] ?? combo.dining_hall}</span>
                            <span className="flex items-center gap-0.5 text-xs text-brand-gold font-medium">
                              <ChevronUpIcon width={12} height={12} />{combo.upvotes}
                            </span>
                            <span className={`flex items-center gap-0.5 text-[11px] ${expiry.urgent ? 'text-orange-500' : 'text-muted'}`}>
                              <ClockIcon width={11} height={11} />{expiry.text}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {confirmDeleteId === combo.id ? (
                            <>
                              <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 rounded-lg text-xs text-muted hover:bg-surface-overlay">Cancel</button>
                              <button onClick={() => handleDelete(combo)} disabled={deletingId === combo.id}
                                className="px-2 py-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-40">
                                {deletingId === combo.id ? '…' : 'Delete'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setEditingCombo(combo)} className="p-2 rounded-full hover:bg-surface-overlay" aria-label="Edit">
                                <PencilIcon width={15} height={15} className="text-muted" />
                              </button>
                              <button onClick={() => setConfirmDeleteId(combo.id)} disabled={deletingId === combo.id}
                                className="p-2 rounded-full hover:bg-red-50 disabled:opacity-40" aria-label="Delete">
                                <TrashIcon width={15} height={15} className="text-red-400" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {editingCombo && (
        <EditComboModal
          combo={editingCombo}
          onClose={() => setEditingCombo(null)}
          onSaved={(updated) => {
            setMyCombos((prev) => prev.map((c) => c.id === updated.id ? updated : c))
            setEditingCombo(null)
            showToast('Combo updated!', 'success')
          }}
        />
      )}
    </div>
  )
}
