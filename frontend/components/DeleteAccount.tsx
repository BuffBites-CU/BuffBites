'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { deleteAccount } from '@/services/usersService'

/** Profile footer: legal links and permanent account deletion, confirmed by typing the username. */
export default function DeleteAccount() {
  const { firebaseUid, username, signOut } = useAuth()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (!firebaseUid || busy) return
    setBusy(true)
    setError('')
    try {
      await deleteAccount(firebaseUid)
      showToast('Your account and data are deleted.', 'neutral')
      await signOut()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your account. Try again.')
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl bg-surface-card px-5 py-4 text-left text-sm font-semibold text-brand-deep shadow-soft card-press"
        >
          Delete account
        </button>
      ) : (
        <div className="card p-4 hatch" role="alertdialog" aria-labelledby="delete-title">
          <p id="delete-title" className="font-display text-[18px] text-brand-black">Delete your account?</p>
          <p className="mt-1 text-[13px] leading-snug text-brand-black">
            This permanently deletes your profile, meal log, favorites, body stats, posts, comments, chat messages,
            tables and Strava connection. It can&apos;t be undone.
          </p>
          <label className="mt-3 block text-[12px] text-muted" htmlFor="delete-confirm">
            Type <b className="text-brand-black">{username}</b> to confirm
          </label>
          <input
            id="delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="mt-1 w-full rounded-xl border border-brand-black bg-surface-card px-3 py-2 text-[16px] text-brand-black focus:outline-none"
          />
          {error && <p className="mt-2 text-[12px] font-semibold text-brand-deep" role="alert">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => { setOpen(false); setTyped(''); setError('') }}
              className="flex-1 rounded-xl bg-surface-card py-2.5 text-[14px] font-semibold text-brand-black ring-1 ring-brand-black"
            >
              Keep it
            </button>
            <button
              onClick={confirm}
              disabled={busy || !username || typed.trim().toLowerCase() !== username.toLowerCase()}
              className="flex-1 rounded-xl bg-brand-black py-2.5 text-[14px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      )}
      <p className="text-center text-[12px] text-muted">
        <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>
        {' · '}
        <Link href="/terms" className="underline underline-offset-2">Terms of Service</Link>
      </p>
    </div>
  )
}
