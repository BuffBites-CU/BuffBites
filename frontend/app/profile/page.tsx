'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getUser, updateUser } from '@/services/usersService'
import { PencilIcon, CheckIcon, XMarkIcon, StarIcon } from '@/components/icons'
import type { DietaryPreference, UserResponse } from '@/types'

const DIETARY_OPTIONS: { key: DietaryPreference; label: string; style: string }[] = [
  { key: 'vegan', label: 'Vegan', style: 'bg-emerald-100 text-emerald-800' },
  { key: 'vegetarian', label: 'Vegetarian', style: 'bg-green-100 text-green-800' },
  { key: 'gluten-free', label: 'Gluten-Free', style: 'bg-yellow-100 text-yellow-800' },
  { key: 'halal', label: 'Halal', style: 'bg-indigo-100 text-indigo-800' },
]

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

  useEffect(() => {
    if (!firebaseUid) { router.replace('/'); return }
    getUser(firebaseUid)
      .then(setProfile)
      .catch(() => router.replace('/'))
      .finally(() => setLoading(false))
  }, [firebaseUid, router])

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
        {/* Toast */}
        {toast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-brand-black text-white px-5 py-3 rounded-2xl text-sm font-medium shadow-lg">
            {toast}
          </div>
        )}

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-200 shadow">
            {firebaseUser?.photoURL ? (
              <Image
                src={firebaseUser.photoURL}
                alt="Profile photo"
                fill
                className="object-cover"
              />
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

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          {editMode ? (
            <div className="p-5 space-y-5">
              {/* Username edit */}
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

              {/* Dietary prefs edit */}
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
              {/* Dietary prefs view */}
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

              {/* Edit button */}
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

              {/* Sign out */}
              <button
                onClick={signOut}
                className="w-full px-5 py-4 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
