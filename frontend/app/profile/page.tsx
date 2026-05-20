'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getUser, updateUser } from '@/services/usersService'
import { getUserCombos, deleteCombo } from '@/services/communityService'
import { PencilIcon, CheckIcon, XMarkIcon, StarIcon, TrashIcon, ClockIcon, ChevronUpIcon } from '@/components/icons'
import { DINING_HALL_LABELS } from '@/types'
import EditComboModal from '@/components/EditComboModal'
import type { DietaryPreference, UserResponse, CommunityCombo } from '@/types'

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

export default function ProfilePage() {
  const router = useRouter()
  const { firebaseUser, firebaseUid, signOut } = useAuth()

  const [profile, setProfile] = useState<UserResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState({ username: '', dietary_preferences: [] as DietaryPreference[] })
  const [saving, setSaving] = useState(false)
  const [usernameError, setUsernameError] = useState('')
  const [toast, setToast] = useState('')

  const [myCombos, setMyCombos] = useState<CommunityCombo[]>([])
  const [combosLoading, setCombosLoading] = useState(false)
  const [editingCombo, setEditingCombo] = useState<CommunityCombo | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function enterEdit() {
    if (!profile) return
    setDraft({ username: profile.username, dietary_preferences: [...profile.dietary_preferences] })
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
    const changes: Partial<typeof draft> = {}
    if (draft.username !== profile.username) changes.username = draft.username
    if (JSON.stringify(draft.dietary_preferences) !== JSON.stringify(profile.dietary_preferences)) {
      changes.dietary_preferences = draft.dietary_preferences
    }

    try {
      await updateUser(firebaseUid, changes)
      setProfile((p) => p ? { ...p, ...changes } : p)
      setEditMode(false)
      showToast('Profile updated!')
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
    setDeletingId(combo.id)
    try {
      const token = await firebaseUser.getIdToken()
      await deleteCombo(combo.id, token)
      setMyCombos((prev) => prev.filter((c) => c.id !== combo.id))
      showToast('Combo deleted.')
    } catch {
      showToast('Failed to delete.')
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
        {toast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-brand-black text-white px-5 py-3 rounded-2xl text-sm font-medium shadow-lg">
            {toast}
          </div>
        )}

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-200 shadow">
            {firebaseUser?.photoURL ? (
              <Image src={firebaseUser.photoURL} alt="Profile photo" fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-brand-gold/20">
                <span className="text-3xl font-bold text-brand-gold">
                  {profile.username[0]?.toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {!editMode && (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-brand-black">@{profile.username}</h1>
              <div className="flex items-center justify-center gap-1.5 mt-1.5">
                <StarIcon width={14} height={14} className="text-brand-gold fill-brand-gold" />
                <span className="text-sm font-medium text-brand-gold">{profile.karma} karma</span>
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
            <div className="bg-white rounded-xl border border-gray-100 px-5 py-8 text-center">
              <p className="text-sm text-muted">No active combos. Share one from the Community tab!</p>
            </div>
          )}

          {!combosLoading && myCombos.length > 0 && (
            <div className="space-y-2">
              {myCombos.map((combo) => {
                const expiry = formatExpiry(combo.expires_at)
                return (
                  <div key={combo.id} className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-brand-black line-clamp-1">{combo.title}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted">
                            {DINING_HALL_LABELS[combo.dining_hall] ?? combo.dining_hall}
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
                        <button
                          onClick={() => setEditingCombo(combo)}
                          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                          aria-label="Edit combo"
                        >
                          <PencilIcon width={15} height={15} className="text-muted" />
                        </button>
                        <button
                          onClick={() => handleDelete(combo)}
                          disabled={deletingId === combo.id}
                          className="p-2 rounded-full hover:bg-red-50 transition-colors disabled:opacity-40"
                          aria-label="Delete combo"
                        >
                          <TrashIcon width={15} height={15} className="text-red-400" />
                        </button>
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
            showToast('Combo updated!')
          }}
        />
      )}
    </div>
  )
}
