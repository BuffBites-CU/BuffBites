'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import Spinner from '@/components/Spinner'
import Doodle from '@/components/Doodle'
import ChatSheet from '@/components/social/ChatSheet'
import InterestChips from '@/components/social/InterestChips'
import OpenSeatSheet from '@/components/social/OpenSeatSheet'
import TableCard from '@/components/social/TableCard'
import { ChatIcon, XMarkIcon } from '@/components/icons'
import { isoOffsetMST, parseApiDate } from '@/lib/date'
import {
  getCatalog, getMyInterests, joinTable, leaveTable, listBlocks, listRooms, listTables, saveMyInterests, unblock,
} from '@/services/socialService'
import type { ChatRoomSummary, DiningHall, DiningTable, SocialCatalog } from '@/types'

const MAX_INTERESTS = 5
const SAFETY_KEY = 'bb-social-safety-ok'

type Tab = 'tables' | 'rooms'
interface OpenChat { room: string; title: string; subtitle?: string }

function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - parseApiDate(iso).getTime()) / 60_000))
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  return `${Math.round(min / 60)}h`
}

/** While the page is in front, run `fn` now and every `ms`. */
function useVisiblePoll(fn: () => void, ms: number) {
  useEffect(() => {
    fn()
    const id = setInterval(() => { if (document.visibilityState === 'visible') fn() }, ms)
    const onShow = () => { if (document.visibilityState === 'visible') fn() }
    document.addEventListener('visibilitychange', onShow)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onShow) }
  }, [fn, ms])
}

const segBtn = (on: boolean) =>
  `flex-1 py-2 text-[13px] font-semibold transition-colors ${on ? 'bg-brand-black text-white' : 'text-brand-black'}`

export default function SocialPage() {
  const signedIn = useRequireAuth()
  const { showToast } = useToast()

  const [catalog, setCatalog] = useState<SocialCatalog | null>(null)
  const [mine, setMine] = useState<string[] | null>(null)
  const [tab, setTab] = useState<Tab>('tables')
  const [day, setDay] = useState<0 | 1>(0)
  const [hall, setHall] = useState<DiningHall | undefined>()
  const [tables, setTables] = useState<DiningTable[] | null>(null)
  const [rooms, setRooms] = useState<ChatRoomSummary[] | null>(null)
  const [busyId, setBusyId] = useState('')
  const [seatOpen, setSeatOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chat, setChat] = useState<OpenChat | null>(null)
  const [safetyOk, setSafetyOk] = useState(true)

  useEffect(() => {
    try { setSafetyOk(localStorage.getItem(SAFETY_KEY) === '1') } catch { setSafetyOk(false) }
  }, [])

  function dismissSafety() {
    setSafetyOk(true)
    try { localStorage.setItem(SAFETY_KEY, '1') } catch { /* private mode */ }
  }

  useEffect(() => {
    if (!signedIn) return
    getCatalog().then(setCatalog).catch(() => showToast('Could not load Dine together.', 'error'))
    getMyInterests().then((r) => setMine(r.interests)).catch(() => setMine([]))
  }, [signedIn, showToast])

  const date = isoOffsetMST(day)
  const refreshTables = useCallback(() => {
    if (!signedIn) return
    listTables(date, hall).then(setTables).catch(() => setTables((t) => t ?? []))
  }, [signedIn, date, hall])
  const refreshRooms = useCallback(() => {
    if (!signedIn) return
    listRooms().then(setRooms).catch(() => setRooms((r) => r ?? []))
  }, [signedIn])

  useVisiblePoll(tab === 'tables' ? refreshTables : refreshRooms, tab === 'tables' ? 20_000 : 30_000)

  const labels = useMemo(
    () => Object.fromEntries((catalog?.interests ?? []).map((i) => [i.key, i.label])),
    [catalog],
  )

  async function saveInterests(next: string[]) {
    const prev = mine
    setMine(next)
    try {
      setMine((await saveMyInterests(next)).interests)
      refreshTables()
    } catch (e) {
      setMine(prev)
      showToast(e instanceof Error ? e.message : 'Could not save interests.', 'error')
    }
  }

  async function act(t: DiningTable, kind: 'join' | 'leave') {
    if (busyId) return
    setBusyId(t.id)
    try {
      if (kind === 'join') {
        const joined = await joinTable(t.id)
        setTables((list) => list?.map((x) => (x.id === t.id ? joined : x)) ?? null)
        showToast(`You're in. Say hi to @${t.host}.`, 'success')
      } else {
        const r = await leaveTable(t.id)
        showToast(r.closed ? 'Table closed.' : 'You left the table.', 'neutral')
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong.', 'error')
    } finally {
      setBusyId('')
      refreshTables()
    }
  }

  if (!signedIn || !catalog || mine == null) return <Spinner page />

  const hallRooms = (rooms ?? []).filter((r) => r.kind === 'hall')
  const interestRooms = (rooms ?? []).filter((r) => r.kind === 'interest')
  const yourRooms = interestRooms.filter((r) => mine.includes(r.id.slice('interest:'.length)))
  const otherRooms = interestRooms.filter((r) => !yourRooms.includes(r))
  const myTables = (tables ?? []).filter((t) => t.hosting || t.joined)
  const openTables = (tables ?? []).filter((t) => !t.hosting && !t.joined)

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="plan-label">Sheet S-01 · Dine together</span>
              <h1 className="font-display text-[30px] leading-none text-brand-black mt-1">Find your table</h1>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="mt-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-brand-black ring-[1.5px] ring-brand-black card-press"
            >
              Interests
            </button>
          </div>
          <div className="mt-3 mb-2 flex overflow-hidden rounded-lg ring-[1.5px] ring-brand-black" role="tablist">
            {(['tables', 'rooms'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={segBtn(tab === t)}>
                {t === 'tables' ? 'Tables' : 'Chat rooms'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-2 space-y-4">
        {!safetyOk && (
          <div className="card hatch p-3 flex gap-3 items-start" role="note">
            <p className="flex-1 text-[12px] leading-snug text-brand-black">
              Meet only in the dining hall. Keep numbers and handles out of chat. Report or block anyone, anytime: three reports hide a message.
            </p>
            <button onClick={dismissSafety} aria-label="Dismiss" className="text-brand-black"><XMarkIcon className="w-4 h-4" /></button>
          </div>
        )}

        {mine.length === 0 && (
          <section className="card p-3.5">
            <span className="plan-label !text-brand-black">Step 1 · Your interests</span>
            <p className="mt-1 text-[13px] text-brand-black">Pick up to {MAX_INTERESTS}. We put tables with people like you first.</p>
            <div className="mt-2.5">
              <InterestChips options={catalog.interests} selected={mine} onChange={saveInterests} max={MAX_INTERESTS} size="sm" />
            </div>
          </section>
        )}

        {tab === 'tables' ? (
          <>
            <section className="card p-4 flex items-center gap-3">
              <Doodle name="plate" size={56} className="text-brand-black flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[21px] leading-tight text-brand-black">Eating alone?</p>
                <p className="text-[12px] leading-snug text-muted">Open a seat and others who share your interests can join.</p>
              </div>
              <button
                onClick={() => setSeatOpen(true)}
                className="flex-shrink-0 rounded-lg bg-brand-black px-3.5 py-2.5 text-[13px] font-semibold text-white card-press"
              >
                Open a seat
              </button>
            </section>

            <div className="space-y-2">
              <div className="flex w-48 overflow-hidden rounded-lg ring-[1.5px] ring-brand-black">
                {([0, 1] as const).map((d) => (
                  <button key={d} onClick={() => setDay(d)} aria-pressed={day === d} className={segBtn(day === d)}>
                    {d === 0 ? 'Today' : 'Tomorrow'}
                  </button>
                ))}
              </div>
              <div className="-mx-4 flex gap-1.5 overflow-x-auto scrollbar-hide px-4 py-0.5">
                {[{ key: undefined, label: 'All' }, ...catalog.halls].map((h) => (
                  <button
                    key={h.key ?? 'all'}
                    onClick={() => setHall(h.key)}
                    aria-pressed={hall === h.key}
                    className={`flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold ring-[1.5px] ring-brand-black ${
                      hall === h.key ? 'bg-brand-black text-white' : 'text-brand-black'
                    }`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>

            {tables == null ? (
              <Spinner />
            ) : (
              <>
                {myTables.length > 0 && (
                  <section className="space-y-2.5" aria-label="Your tables">
                    <span className="plan-label !text-brand-black">Your tables</span>
                    {myTables.map((t) => (
                      <TableCard key={t.id} table={t} labels={labels} busy={busyId === t.id}
                        onJoin={() => act(t, 'join')} onLeave={() => act(t, 'leave')}
                        onChat={() => setChat({ room: `table:${t.id}`, title: `${t.hall} · ${t.period}`, subtitle: `Hosted by @${t.host}` })} />
                    ))}
                  </section>
                )}
                <section className="space-y-2.5" aria-label="Open tables">
                  <div className="flex items-baseline justify-between">
                    <span className="plan-label !text-brand-black">Open tables</span>
                    <span className="plan-label">{openTables.length} {day === 0 ? 'today' : 'tomorrow'}</span>
                  </div>
                  <div className="dim-line" aria-hidden />
                  {openTables.length === 0 ? (
                    <div className="card p-5 text-center">
                      <Doodle name="coffee" size={52} draw={false} className="mx-auto text-brand-black" />
                      <p className="mt-2 font-display text-[19px] text-brand-black">No open tables yet</p>
                      <p className="mt-1 text-[12px] text-muted">Be the first. Most people join within the hour before a meal.</p>
                    </div>
                  ) : (
                    openTables.map((t) => (
                      <TableCard key={t.id} table={t} labels={labels} busy={busyId === t.id}
                        onJoin={() => act(t, 'join')} onLeave={() => act(t, 'leave')}
                        onChat={() => setChat({ room: `table:${t.id}`, title: `${t.hall} · ${t.period}`, subtitle: `Hosted by @${t.host}` })} />
                    ))
                  )}
                </section>
              </>
            )}
          </>
        ) : rooms == null ? (
          <Spinner />
        ) : (
          <>
            <RoomGroup title="Dining halls" rooms={hallRooms} onOpen={setChat} />
            {yourRooms.length > 0 && <RoomGroup title="Your interests" rooms={yourRooms} onOpen={setChat} />}
            <RoomGroup title={yourRooms.length ? 'More interests' : 'Interests'} rooms={otherRooms} onOpen={setChat} />
            <p className="pb-2 text-center text-[11px] text-muted">Messages disappear after 24 hours.</p>
          </>
        )}
      </main>

      <OpenSeatSheet
        open={seatOpen}
        halls={catalog.halls}
        interests={catalog.interests}
        myInterests={mine}
        defaultHall={hall ?? catalog.halls[0]?.key ?? 'c4c'}
        onClose={() => setSeatOpen(false)}
        onOpened={(t) => {
          setSeatOpen(false)
          setDay(t.date === isoOffsetMST(1) ? 1 : 0)
          setTables((list) => [t, ...(list ?? []).filter((x) => x.id !== t.id)])
          showToast('Your table is open. We will show it to people nearby.', 'success')
        }}
      />

      {settingsOpen && (
        <SettingsSheet
          catalog={catalog}
          mine={mine}
          onSave={saveInterests}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {chat && <ChatSheet room={chat.room} title={chat.title} subtitle={chat.subtitle} onClose={() => { setChat(null); refreshRooms() }} />}
    </div>
  )
}

function RoomGroup({ title, rooms, onOpen }: { title: string; rooms: ChatRoomSummary[]; onOpen: (c: OpenChat) => void }) {
  if (rooms.length === 0) return null
  return (
    <section aria-label={title}>
      <span className="plan-label !text-brand-black">{title}</span>
      <div className="dim-line mt-1 mb-2" aria-hidden />
      <ul className="card divide-y divide-brand-black/15 overflow-hidden">
        {rooms.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => onOpen({ room: r.id, title: r.label, subtitle: r.kind === 'hall' ? 'Dining hall room' : 'Interest room' })}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left card-press"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ring-[1.5px] ring-brand-black text-brand-black">
                <ChatIcon className="w-[18px] h-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-display text-[17px] leading-tight text-brand-black">{r.label}</span>
                  {r.last_at && <span className="flex-shrink-0 font-mono text-[10px] text-muted">{ago(r.last_at)}</span>}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {r.last_text ? `@${r.last_author}: ${r.last_text}` : 'Quiet right now. Start it off.'}
                </span>
              </span>
              {r.active > 0 && (
                <span className="flex-shrink-0 rounded-full bg-brand-black px-2 py-0.5 font-mono text-[10px] text-white">{r.active} here</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SettingsSheet({ catalog, mine, onSave, onClose }: {
  catalog: SocialCatalog
  mine: string[]
  onSave: (next: string[]) => void
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [blocks, setBlocks] = useState<Array<{ id: string; name: string }> | null>(null)

  useEffect(() => {
    listBlocks().then(setBlocks).catch(() => setBlocks([]))
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function undo(id: string) {
    try {
      await unblock(id)
      setBlocks((b) => b?.filter((x) => x.id !== id) ?? null)
    } catch {
      showToast('Could not unblock. Try again.', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Interests and blocked people"
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl bg-surface p-4 pb-8 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="plan-label !text-brand-black">Your interests · up to {MAX_INTERESTS}</span>
          <button onClick={onClose} aria-label="Close" className="text-brand-black"><XMarkIcon className="w-5 h-5" /></button>
        </div>
        <p className="mt-1 text-[12px] text-muted">Shown on tables you open, and used to sort tables for you.</p>
        <div className="mt-3">
          <InterestChips options={catalog.interests} selected={mine} onChange={onSave} max={MAX_INTERESTS} size="sm" />
        </div>

        <div className="dim-line my-4" aria-hidden />
        <span className="plan-label !text-brand-black">Blocked</span>
        {blocks == null ? (
          <p className="mt-2 text-[12px] text-muted">Loading…</p>
        ) : blocks.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted">No one. Tap a message in any chat to report or block its author.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-lg px-3 py-2 ring-[1.5px] ring-brand-black">
                <span className="text-[14px] text-brand-black">@{b.name}</span>
                <button onClick={() => undo(b.id)} className="text-[12px] font-semibold text-brand-black underline underline-offset-2">Unblock</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
