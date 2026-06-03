'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { getUser, updateUser } from '@/services/usersService'
import { getUserCombos, deleteCombo } from '@/services/communityService'
import { PencilIcon, CheckIcon, XMarkIcon, StarIcon, TrashIcon, ClockIcon, ChevronUpIcon } from '@/components/icons'
import { DINING_HALLS, DINING_HALL_LABELS } from '@/types'
import EditComboModal from '@/components/EditComboModal'
import type { DietaryPreference, DiningHall, UserResponse, CommunityCombo, MealLogEntry } from '@/types'

/* ── Constants ────────────────────────────────────────────────── */

const DIETARY_OPTIONS: { key: DietaryPreference; label: string; style: string }[] = [
  { key: 'vegan',        label: 'Vegan',        style: 'bg-emerald-100 text-emerald-800' },
  { key: 'vegetarian',   label: 'Vegetarian',   style: 'bg-green-100 text-green-800' },
  { key: 'gluten-free',  label: 'Gluten-Free',  style: 'bg-yellow-100 text-yellow-800' },
  { key: 'halal',        label: 'Halal',        style: 'bg-indigo-100 text-indigo-800' },
]

/* ── Helpers ──────────────────────────────────────────────────── */

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function isoOffset(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function formatExpiry(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', urgent: true }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return { text: h > 0 ? `${h}h ${m}m left` : `${m}m left`, urgent: h < 1 }
}

function karmaLabel(karma: number): string {
  if (karma >= 200) return 'top contributor'
  if (karma >= 50) return 'rising star'
  if (karma >= 10) return 'regular'
  return 'getting started'
}

function computeStreak(mealLog: MealLogEntry[]): number {
  const dates = [...new Set(mealLog.map((e) => e.date))].sort().reverse()
  if (dates.length === 0) return 0
  const today = todayISO()
  const yesterday = isoOffset(-1)
  if (dates[0] !== today && dates[0] !== yesterday) return 0
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
  if (log.length >= 1)    badges.push({ id: 'first_bite',    icon: '🍽', label: 'First Bite',      desc: 'Logged your first meal' })
  if (streak >= 3)        badges.push({ id: 'streak_3',      icon: '🔥', label: '3-Day Streak',    desc: '3 days in a row' })
  if (streak >= 7)        badges.push({ id: 'streak_7',      icon: '⚡', label: 'Week Warrior',    desc: '7-day streak' })
  if (profile.karma >= 10) badges.push({ id: 'rising',       icon: '⭐', label: 'Rising Star',     desc: '10 karma earned' })
  if (profile.karma >= 50) badges.push({ id: 'community',    icon: '🌟', label: 'Community Star',  desc: '50 karma earned' })
  if (halls >= 3)         badges.push({ id: 'explorer',      icon: '🗺', label: 'Hall Explorer',   desc: 'Ate at 3+ dining halls' })
  if (log.length >= 20)   badges.push({ id: 'regular',       icon: '🦬', label: 'Buffalo Regular', desc: '20 meals logged' })
  return badges
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

/* ── Sub-components ───────────────────────────────────────────── */

function WeeklyChart({
  mealLog,
  goalPerMeal,
}: {
  mealLog: MealLogEntry[]
  goalPerMeal?: number
}) {
  const data = getWeekData(mealLog)
  const dailyGoal = goalPerMeal ? goalPerMeal * 3 : null
  const maxCal = Math.max(...data.map((d) => d.calories), dailyGoal ?? 0, 100)
  const BAR_H = 80
  const today = todayISO()

  return (
    <div>
      <h2 className="text-base font-display font-bold text-brand-black mb-3">This Week</h2>
      <div className="bg-surface-card rounded-3xl border border-surface-overlay shadow-card-sm p-4">
        <div className="flex items-end justify-between gap-1.5 h-24 relative">
          {/* Goal line */}
          {dailyGoal && (
            <div
              className="absolute left-0 right-0 border-t border-dashed border-brand-gold/50 pointer-events-none z-10"
              style={{ bottom: `${(dailyGoal / maxCal) * BAR_H}px` }}
            />
          )}

          {data.map(({ iso, label, calories }) => {
            const isToday = iso === today
            const pct = calories > 0 ? Math.max((calories / maxCal) * BAR_H, 6) : 0
            const overGoal = dailyGoal && calories > dailyGoal
            return (
              <div key={iso} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center" style={{ height: BAR_H }}>
                  <div
                    className={`w-full rounded-t-md transition-all duration-500 ${
                      calories === 0
                        ? 'bg-surface-overlay rounded-md'
                        : overGoal
                        ? 'bg-amber-400'
                        : isToday
                        ? 'bg-brand-gold'
                        : 'bg-brand-gold/50'
                    }`}
                    style={{ height: calories === 0 ? 4 : pct }}
                  />
                </div>
                <span className={`text-[9px] font-display font-semibold uppercase tracking-wide ${isToday ? 'text-brand-gold' : 'text-muted'}`}>
                  {label}
                </span>
                {calories > 0 && (
                  <span className="text-[8px] text-muted leading-none">{calories}</span>
                )}
              </div>
            )
          })}
        </div>

        {dailyGoal && (
          <p className="text-[10px] text-muted mt-2 text-right">
            — {dailyGoal} cal/day goal
          </p>
        )}
      </div>
    </div>
  )
}

function TodaysMeals({
  mealLog,
  calorieGoal,
}: {
  mealLog: MealLogEntry[]
  calorieGoal?: number
}) {
  const today = todayISO()
  const todayMeals = mealLog.filter((e) => e.date === today)
  const totalCal = todayMeals.reduce((s, e) => s + e.calories, 0)

  if (todayMeals.length === 0 && !calorieGoal) return null

  const pct = calorieGoal && totalCal > 0
    ? Math.min(Math.round((totalCal / (calorieGoal * 3)) * 100), 100)
    : 0

  return (
    <div>
      <h2 className="text-base font-display font-bold text-brand-black mb-3">Today&apos;s Calories</h2>
      <div className="bg-surface-card rounded-3xl border border-surface-overlay shadow-card-sm overflow-hidden">
        {calorieGoal && (
          <div className="px-5 pt-4 pb-3 border-b border-surface-overlay">
            <div className="flex items-end justify-between mb-2">
              <div>
                <span className="text-2xl font-display font-bold text-brand-black">{totalCal}</span>
                <span className="text-sm text-muted ml-1">/ {calorieGoal * 3} cal today</span>
              </div>
              <span className="text-xs text-muted">{calorieGoal} cal/meal goal</span>
            </div>
            <div className="h-2 bg-surface-overlay rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  pct >= 100 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-400' : 'bg-brand-gold'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {todayMeals.length === 0 ? (
          <p className="text-sm text-muted px-5 py-4">No meals logged today.</p>
        ) : (
          <div className="divide-y divide-surface-overlay">
            {todayMeals.map((entry, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-display font-semibold text-brand-black line-clamp-1">{entry.title}</p>
                  <p className="text-[11px] text-muted mt-0.5 capitalize">{entry.meal_period} · {DINING_HALL_LABELS[entry.dining_hall as DiningHall] ?? entry.dining_hall}</p>
                </div>
                <span className="text-sm font-bold text-brand-gold ml-3 flex-shrink-0">{entry.calories} cal</span>
              </div>
            ))}
            {todayMeals.length > 1 && (
              <div className="flex items-center justify-between px-5 py-3 bg-surface-overlay/50">
                <span className="text-xs font-display font-semibold text-muted uppercase tracking-wider">Total</span>
                <span className="text-sm font-bold text-brand-black">{totalCal} cal</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main Page ────────────────────────────────────────────────── */

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
  })
  const [saving, setSaving] = useState(false)
  const [usernameError, setUsernameError] = useState('')

  const [myCombos, setMyCombos] = useState<CommunityCombo[]>([])
  const [combosLoading, setCombosLoading] = useState(false)
  const [editingCombo, setEditingCombo] = useState<CommunityCombo | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseUid) { router.replace('/'); return }
    getUser(firebaseUid)
      .then(setProfile)
      .catch(() => router.replace('/'))
      .finally(() => setLoading(false))
  }, [firebaseUid, router])

  useEffect(() => {
    if (!firebaseUid) return
    setCombosLoading(true)
    getUserCombos(firebaseUid)
      .then(setMyCombos)
      .catch(() => setMyCombos([]))
      .finally(() => setCombosLoading(false))
  }, [firebaseUid])

  function enterEdit() {
    if (!profile) return
    setDraft({
      username: profile.username,
      dietary_preferences: [...profile.dietary_preferences],
      preferred_calories_per_meal: profile.preferred_calories_per_meal != null
        ? String(profile.preferred_calories_per_meal)
        : '',
      default_dining_hall: profile.default_dining_hall ?? '',
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
    if (!draft.username.trim() || draft.username.length < 3) {
      setUsernameError('Username must be at least 3 characters.')
      return
    }

    setSaving(true)
    const parsedCal = draft.preferred_calories_per_meal !== ''
      ? parseInt(draft.preferred_calories_per_meal, 10)
      : undefined
    const newHall = draft.default_dining_hall || null

    const changes: Record<string, unknown> = {}
    if (draft.username !== profile.username) changes.username = draft.username
    if (JSON.stringify(draft.dietary_preferences) !== JSON.stringify(profile.dietary_preferences))
      changes.dietary_preferences = draft.dietary_preferences
    if (parsedCal !== profile.preferred_calories_per_meal)
      changes.preferred_calories_per_meal = parsedCal ?? null
    if (newHall !== (profile.default_dining_hall ?? null))
      changes.default_dining_hall = newHall

    try {
      await updateUser(firebaseUid, changes as Parameters<typeof updateUser>[1])
      setProfile((p) => p ? {
        ...p,
        ...changes,
        preferred_calories_per_meal: parsedCal ?? undefined,
        default_dining_hall: newHall ?? undefined,
      } : p)
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

  async function handleDelete(combo: CommunityCombo) {
    if (!firebaseUser) return
    setConfirmDeleteId(null)
    setDeletingId(combo.id)
    try {
      const token = await firebaseUser.getIdToken()
      await deleteCombo(combo.id, token)
      setMyCombos((prev) => prev.filter((c) => c.id !== combo.id))
      showToast('Combo deleted.', 'neutral')
    } catch {
      showToast('Failed to delete.', 'error')
    } finally {
      setDeletingId(null)
    }
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

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-md mx-auto px-4 pt-12 space-y-6">

        {/* ── Avatar + identity ─────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-surface-overlay shadow ring-2 ring-brand-gold/40">
            {firebaseUser?.photoURL ? (
              <Image src={firebaseUser.photoURL} alt="Profile photo" fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-brand-gold/20">
                <span className="text-3xl font-display font-bold text-brand-gold">
                  {profile.username[0]?.toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {!editMode && (
            <div className="text-center">
              <h1 className="text-2xl font-display font-bold text-brand-black">@{profile.username}</h1>
              <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
                <div className="flex items-center gap-1">
                  <StarIcon width={13} height={13} className="text-brand-gold fill-brand-gold" />
                  <span className="text-sm font-medium text-brand-gold">{profile.karma}</span>
                  <span className="text-xs text-muted">· {karmaLabel(profile.karma)}</span>
                </div>
                {streak > 0 && (
                  <span className="flex items-center gap-1 text-xs font-display font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                    🔥 {streak}-day streak
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Badges ────────────────────────────────────────── */}
        {badges.length > 0 && !editMode && (
          <div>
            <p className="text-xs font-display font-semibold text-muted uppercase tracking-wider mb-2">Achievements</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {badges.map((b) => (
                <div
                  key={b.id}
                  title={b.desc}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-surface-card border border-surface-overlay rounded-full px-3 py-1.5 shadow-card-sm"
                >
                  <span className="text-base leading-none">{b.icon}</span>
                  <span className="text-xs font-display font-semibold text-brand-black whitespace-nowrap">{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Profile card ──────────────────────────────────── */}
        <div className="bg-surface-card rounded-3xl border border-surface-overlay shadow-card-sm overflow-hidden">
          {editMode ? (
            <div className="p-5 space-y-5">
              {/* Username */}
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

              {/* Dietary Preferences */}
              <div>
                <label className="text-xs font-display font-semibold text-muted uppercase tracking-wider block mb-2">Dietary Preferences</label>
                <div className="flex flex-wrap gap-2">
                  {DIETARY_OPTIONS.map(({ key, label, style }) => (
                    <button
                      key={key}
                      onClick={() => togglePref(key)}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-all ${
                        draft.dietary_preferences.includes(key)
                          ? `${style} border-transparent`
                          : 'bg-surface-overlay text-muted border-transparent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default dining hall */}
              <div>
                <label className="text-xs font-display font-semibold text-muted uppercase tracking-wider block mb-2">Default Dining Hall</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setDraft((d) => ({ ...d, default_dining_hall: '' }))}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                      draft.default_dining_hall === ''
                        ? 'bg-brand-black text-brand-gold'
                        : 'bg-surface-overlay text-muted'
                    }`}
                  >
                    None
                  </button>
                  {DINING_HALLS.map((hall) => (
                    <button
                      key={hall}
                      onClick={() => setDraft((d) => ({ ...d, default_dining_hall: hall }))}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                        draft.default_dining_hall === hall
                          ? 'bg-brand-black text-brand-gold'
                          : 'bg-surface-overlay text-muted'
                      }`}
                    >
                      {DINING_HALL_LABELS[hall]}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted mt-1.5">Home page opens to this hall automatically</p>
              </div>

              {/* Calorie goal */}
              <div>
                <label className="text-xs font-display font-semibold text-muted uppercase tracking-wider block mb-1.5">Calorie Goal per Meal</label>
                <div className="relative">
                  <input
                    type="number"
                    min={100}
                    max={3000}
                    placeholder="e.g. 700"
                    value={draft.preferred_calories_per_meal}
                    onChange={(e) => setDraft((d) => ({ ...d, preferred_calories_per_meal: e.target.value }))}
                    className="w-full rounded-xl border border-surface-warm px-4 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold bg-surface"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-xs">cal</span>
                </div>
                <p className="text-[11px] text-muted mt-1">Leave empty to remove goal</p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setEditMode(false)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-surface-warm text-sm text-muted hover:bg-surface-overlay transition-colors"
                >
                  <XMarkIcon width={16} height={16} />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-gold text-brand-black text-sm font-display font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity"
                >
                  <CheckIcon width={16} height={16} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-surface-overlay">
              {/* Dietary prefs */}
              <div className="px-5 py-4">
                <p className="text-xs font-display font-semibold text-muted uppercase tracking-wider mb-2">Dietary Preferences</p>
                {profile.dietary_preferences.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.dietary_preferences.map((pref) => {
                      const opt = DIETARY_OPTIONS.find((o) => o.key === pref)
                      return (
                        <span key={pref} className={`rounded-full px-3 py-1 text-sm font-medium ${opt?.style ?? 'bg-surface-overlay text-muted'}`}>
                          {opt?.label ?? pref}
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No preferences set</p>
                )}
              </div>

              {/* Default dining hall */}
              {profile.default_dining_hall && (
                <div className="px-5 py-4">
                  <p className="text-xs font-display font-semibold text-muted uppercase tracking-wider mb-1">Default Hall</p>
                  <p className="text-sm text-brand-black font-medium">
                    {DINING_HALL_LABELS[profile.default_dining_hall as DiningHall] ?? profile.default_dining_hall}
                  </p>
                </div>
              )}

              {/* Calorie goal */}
              {profile.preferred_calories_per_meal != null && (
                <div className="px-5 py-4">
                  <p className="text-xs font-display font-semibold text-muted uppercase tracking-wider mb-1">Calorie Goal</p>
                  <p className="text-sm text-brand-black font-medium">{profile.preferred_calories_per_meal} cal per meal</p>
                </div>
              )}

              <button
                onClick={enterEdit}
                className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-brand-black hover:bg-surface-overlay transition-colors"
              >
                <span className="flex items-center gap-2">
                  <PencilIcon width={16} height={16} className="text-muted" />
                  Edit Profile
                </span>
                <span className="text-muted text-lg">›</span>
              </button>

              <button
                onClick={signOut}
                className="w-full px-5 py-4 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>

        {/* ── Calorie sections ──────────────────────────────── */}
        <TodaysMeals mealLog={mealLog} calorieGoal={profile.preferred_calories_per_meal} />

        {mealLog.length > 0 && (
          <WeeklyChart mealLog={mealLog} goalPerMeal={profile.preferred_calories_per_meal} />
        )}

        {/* ── Favorites ────────────────────────────────────── */}
        {(profile.favorites ?? []).length > 0 && (
          <div>
            <h2 className="text-base font-display font-bold text-brand-black mb-3">Saved Combos</h2>
            <div className="space-y-2">
              {(profile.favorites ?? []).slice().reverse().map((fav, i) => (
                <div key={i} className="bg-surface-card rounded-xl border border-surface-overlay p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-red-400 mt-0.5 flex-shrink-0">♥</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-semibold text-sm text-brand-black line-clamp-1">{fav.title}</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {DINING_HALL_LABELS[fav.dining_hall as DiningHall] ?? fav.dining_hall} · {fav.date}
                        {fav.approximate_calories ? ` · ~${fav.approximate_calories} cal` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── My Combos ─────────────────────────────────────── */}
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
              <Link
                href="/community"
                className="inline-block px-4 py-2 rounded-xl bg-brand-gold text-brand-black text-sm font-display font-semibold hover:opacity-90 transition-opacity"
              >
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
                            <span className="text-xs text-muted">
                              {combo.dishes.length} dishes · {DINING_HALL_LABELS[combo.dining_hall] ?? combo.dining_hall}
                            </span>
                            <span className="flex items-center gap-0.5 text-xs text-brand-gold font-medium">
                              <ChevronUpIcon width={12} height={12} />
                              {combo.upvotes}
                            </span>
                            <span className={`flex items-center gap-0.5 text-[11px] ${expiry.urgent ? 'text-orange-500' : 'text-muted'}`}>
                              <ClockIcon width={11} height={11} />
                              {expiry.text}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {confirmDeleteId === combo.id ? (
                            <>
                              <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 rounded-lg text-xs text-muted hover:bg-surface-overlay transition-colors">Cancel</button>
                              <button
                                onClick={() => handleDelete(combo)}
                                disabled={deletingId === combo.id}
                                className="px-2 py-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                              >
                                {deletingId === combo.id ? '…' : 'Delete'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setEditingCombo(combo)} className="p-2 rounded-full hover:bg-surface-overlay transition-colors" aria-label="Edit combo">
                                <PencilIcon width={15} height={15} className="text-muted" />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(combo.id)}
                                disabled={deletingId === combo.id}
                                className="p-2 rounded-full hover:bg-red-50 transition-colors disabled:opacity-40"
                                aria-label="Delete combo"
                              >
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
