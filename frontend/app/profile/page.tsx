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
import { DINING_HALL_LABELS } from '@/types'
import EditComboModal from '@/components/EditComboModal'
import type { DietaryPreference, UserResponse, CommunityCombo, MealLogEntry } from '@/types'

const DIETARY_OPTIONS: { key: DietaryPreference; label: string; style: string }[] = [
  { key: 'vegan', label: 'Vegan', style: 'bg-emerald-100 text-emerald-800' },
  { key: 'vegetarian', label: 'Vegetarian', style: 'bg-green-100 text-green-800' },
  { key: 'gluten-free', label: 'Gluten-Free', style: 'bg-yellow-100 text-yellow-800' },
  { key: 'halal', label: 'Halal', style: 'bg-indigo-100 text-indigo-800' },
]

function formatExpiry(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', urgent: true }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return { text: h > 0 ? `${h}h ${m}m left` : `${m}m left`, urgent: h < 1 }
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function karmaLabel(karma: number): string {
  if (karma >= 200) return 'top contributor'
  if (karma >= 50) return 'rising star'
  if (karma >= 10) return 'regular'
  return 'getting started'
}

export default function ProfilePage() {
  const router = useRouter()
  const { firebaseUser, firebaseUid, signOut } = useAuth()
  const { showToast } = useToast()

  const [profile, setProfile] = useState<UserResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState({ username: '', dietary_preferences: [] as DietaryPreference[], preferred_calories_per_meal: '' as string })
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
    const parsedCal = draft.preferred_calories_per_meal !== '' ? parseInt(draft.preferred_calories_per_meal, 10) : undefined
    const changes: Record<string, unknown> = {}
    if (draft.username !== profile.username) changes.username = draft.username
    if (JSON.stringify(draft.dietary_preferences) !== JSON.stringify(profile.dietary_preferences)) {
      changes.dietary_preferences = draft.dietary_preferences
    }
    if (parsedCal !== profile.preferred_calories_per_meal) {
      changes.preferred_calories_per_meal = parsedCal ?? null
    }

    try {
      await updateUser(firebaseUid, changes as Parameters<typeof updateUser>[1])
      setProfile((p) => p ? { ...p, ...changes, preferred_calories_per_meal: parsedCal ?? undefined } : p)
      setEditMode(false)
      showToast('Profile updated!', 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('username')) {
        setUsernameError('That username is already taken.')
      }
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

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-md mx-auto px-4 pt-12 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-200 shadow ring-2 ring-brand-gold/40 group">
            {firebaseUser?.photoURL ? (
              <Image src={firebaseUser.photoURL} alt="Profile photo" fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-brand-gold/20">
                <span className="text-3xl font-bold text-brand-gold">
                  {profile.username[0]?.toUpperCase()}
                </span>
              </div>
            )}
            {/* Camera overlay hint */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
          </div>

          {!editMode && (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-brand-black">@{profile.username}</h1>
              <div className="flex items-center justify-center gap-1.5 mt-1.5">
                <StarIcon width={14} height={14} className="text-brand-gold fill-brand-gold" />
                <span className="text-sm font-medium text-brand-gold">{profile.karma} karma</span>
                <span className="text-muted text-xs">·</span>
                <span className="text-xs text-muted">{karmaLabel(profile.karma)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Profile card */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          {editMode ? (
            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm">@</span>
                  <input
                    value={draft.username}
                    onChange={(e) => { setDraft((d) => ({ ...d, username: e.target.value })); setUsernameError('') }}
                    maxLength={20}
                    className="w-full rounded-xl border border-gray-200 pl-8 pr-4 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold"
                  />
                </div>
                {usernameError && <p className="text-xs text-red-500 mt-1">{usernameError}</p>}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                  Dietary Preferences
                </label>
                <div className="flex flex-wrap gap-2">
                  {DIETARY_OPTIONS.map(({ key, label, style }) => (
                    <button
                      key={key}
                      onClick={() => togglePref(key)}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-all ${
                        draft.dietary_preferences.includes(key)
                          ? `${style} border-transparent`
                          : 'bg-gray-100 text-muted border-transparent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">
                  Calorie Goal per Meal
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={100}
                    max={3000}
                    placeholder="e.g. 700"
                    value={draft.preferred_calories_per_meal}
                    onChange={(e) => setDraft((d) => ({ ...d, preferred_calories_per_meal: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-gold"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-xs">cal</span>
                </div>
                <p className="text-[11px] text-muted mt-1">Leave empty to remove your goal</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setEditMode(false)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 text-sm text-muted hover:bg-gray-50 transition-colors"
                >
                  <XMarkIcon width={16} height={16} />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand-gold text-brand-black text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity"
                >
                  <CheckIcon width={16} height={16} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Dietary Preferences</p>
                {profile.dietary_preferences.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.dietary_preferences.map((pref) => {
                      const opt = DIETARY_OPTIONS.find((o) => o.key === pref)
                      return (
                        <span key={pref} className={`rounded-full px-3 py-1 text-sm font-medium ${opt?.style ?? 'bg-gray-100 text-muted'}`}>
                          {opt?.label ?? pref}
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No preferences set</p>
                )}
              </div>

              {profile.preferred_calories_per_meal != null && (
                <div className="px-5 py-4 border-t border-gray-50">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Calorie Goal</p>
                  <p className="text-sm text-brand-black font-medium">{profile.preferred_calories_per_meal} cal per meal</p>
                </div>
              )}

              <button
                onClick={enterEdit}
                className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-brand-black hover:bg-gray-50 transition-colors"
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

        {/* Today's Meals */}
        <TodaysMeals
          mealLog={profile.meal_log ?? []}
          calorieGoal={profile.preferred_calories_per_meal}
        />

        {/* My Combos */}
        <div>
          <h2 className="text-base font-bold text-brand-black mb-3">My Combos</h2>

          {combosLoading && (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded-full w-1/2 mb-2" />
                  <div className="h-3 bg-gray-200 rounded-full w-1/3" />
                </div>
              ))}
            </div>
          )}

          {!combosLoading && myCombos.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 px-5 py-8 text-center space-y-3">
              <p className="text-sm text-muted">You haven&apos;t shared any combos yet.</p>
              <Link
                href="/community"
                className="inline-block px-4 py-2 rounded-xl bg-brand-gold text-brand-black text-sm font-semibold hover:opacity-90 transition-opacity"
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
                  <div key={combo.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="flex">
                      <div className="w-1 bg-brand-gold flex-shrink-0" />
                      <div className="flex items-start justify-between gap-3 flex-1 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-brand-black line-clamp-1">{combo.title}</p>
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
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded-lg text-xs text-muted hover:bg-gray-100 transition-colors"
                            >
                              Cancel
                            </button>
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
                            <button
                              onClick={() => setEditingCombo(combo)}
                              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                              aria-label="Edit combo"
                            >
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

function TodaysMeals({
  mealLog,
  calorieGoal,
}: {
  mealLog: MealLogEntry[]
  calorieGoal?: number
}) {
  const today = todayISO()
  const todayMeals = mealLog.filter((e) => e.date === today)
  const totalCal = todayMeals.reduce((sum, e) => sum + e.calories, 0)

  if (todayMeals.length === 0 && !calorieGoal) return null

  const pct = calorieGoal && totalCal > 0
    ? Math.min(Math.round((totalCal / (calorieGoal * 3)) * 100), 100)
    : 0

  return (
    <div>
      <h2 className="text-base font-bold text-brand-black mb-3">Today&apos;s Calories</h2>
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {calorieGoal && (
          <div className="px-5 pt-4 pb-3 border-b border-gray-50">
            <div className="flex items-end justify-between mb-2">
              <div>
                <span className="text-2xl font-bold text-brand-black">{totalCal}</span>
                <span className="text-sm text-muted ml-1">/ {calorieGoal * 3} cal today</span>
              </div>
              <span className="text-xs text-muted">{calorieGoal} cal/meal goal</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
          <div className="divide-y divide-gray-50">
            {todayMeals.map((entry, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-brand-black line-clamp-1">{entry.title}</p>
                  <p className="text-[11px] text-muted mt-0.5">{entry.meal_period} · {entry.dining_hall}</p>
                </div>
                <span className="text-sm font-semibold text-brand-gold ml-3 flex-shrink-0">
                  {entry.calories} cal
                </span>
              </div>
            ))}
            {todayMeals.length > 1 && (
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50/60">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Total</span>
                <span className="text-sm font-bold text-brand-black">{totalCal} cal</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
