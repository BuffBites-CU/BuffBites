'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { blockAuthor, listMessages, reportMessage, sendMessage } from '@/services/socialService'
import { useToast } from '@/context/ToastContext'
import { parseApiDate } from '@/lib/date'
import type { ChatMessage } from '@/types'
import Avatar from '../Avatar'
import Spinner from '../Spinner'
import { ChevronLeftIcon, SendIcon } from '../icons'

const POLL_MS = 4000
const MAX_LEN = 280

interface Props {
  room: string
  title: string
  subtitle?: string
  onClose: () => void
}

function clock(iso: string) {
  return parseApiDate(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/**
 * A full-screen chat for one room. New messages arrive by polling every few
 * seconds while the app is in front; nothing polls in the background.
 */
export default function ChatSheet({ room, title, subtitle, onClose }: Props) {
  const { showToast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const lastId = useRef<string | undefined>(undefined)
  const listRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)

  useEffect(() => setMounted(true), [])

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return
    lastId.current = incoming[incoming.length - 1].id
    setMessages((prev) => {
      const seen = new Set((prev ?? []).map((m) => m.id))
      return [...(prev ?? []), ...incoming.filter((m) => !seen.has(m.id))]
    })
  }, [])

  useEffect(() => {
    let alive = true
    lastId.current = undefined
    setMessages(null)
    listMessages(room)
      .then((m) => { if (alive) { setMessages(m); lastId.current = m.at(-1)?.id } })
      .catch((e) => { if (alive) { setMessages([]); setError(e instanceof Error ? e.message : 'Could not load chat.') } })
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      listMessages(room, lastId.current).then((m) => { if (alive) merge(m) }).catch(() => {})
    }, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [room, merge])

  // Keep the newest message in view unless the student scrolled up to read.
  useEffect(() => {
    const el = listRef.current
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    try {
      const m = await sendMessage(room, body)
      // Don't advance the poll cursor: someone else may have posted just before us.
      setMessages((prev) => [...(prev ?? []), m])
      setText('')
      nearBottom.current = true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.')
    } finally {
      setSending(false)
    }
  }

  async function report(m: ChatMessage) {
    setMenuFor(null)
    try {
      const r = await reportMessage(m.id)
      if (r.hidden) setMessages((prev) => (prev ?? []).filter((x) => x.id !== m.id))
      showToast('Thanks. We’ll take a look.', 'neutral')
    } catch { showToast('Could not report that message.', 'error') }
  }

  async function block(m: ChatMessage) {
    setMenuFor(null)
    try {
      await blockAuthor(m.id)
      setMessages((prev) => (prev ?? []).filter((x) => x.author !== m.author))
      showToast(`Blocked @${m.author}. You won’t see their messages or tables.`, 'neutral')
    } catch { showToast('Could not block.', 'error') }
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label={title} style={{ height: '100dvh' }}>
      <header className="flex items-center gap-2 border-b-[1.5px] border-brand-black px-2 pt-[max(10px,env(safe-area-inset-top))] pb-2">
        <button onClick={onClose} aria-label="Back" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-overlay">
          <ChevronLeftIcon width={22} height={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[22px] leading-none text-brand-black truncate">{title}</h2>
          {subtitle && <p className="plan-label mt-1 truncate">{subtitle}</p>}
        </div>
      </header>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
      >
        <p className="mx-auto mb-4 max-w-xs text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Messages disappear after 24 hours · Meet in the dining hall · Report or block anytime
        </p>
        {messages == null ? (
          <div className="flex justify-center pt-10"><Spinner /></div>
        ) : messages.length === 0 ? (
          <p className="pt-10 text-center font-display text-[18px] text-brand-black">Quiet here. Say hi.</p>
        ) : (
          <ul className="space-y-1.5">
            {messages.map((m, i) => {
              const runStart = i === 0 || messages[i - 1].author !== m.author
              return (
                <li key={m.id} className={`flex gap-2 ${m.mine ? 'justify-end' : 'justify-start'} ${runStart ? 'pt-2' : ''}`}>
                  {!m.mine && (runStart ? <Avatar name={m.author} size={28} className="mt-4" /> : <span className="w-7 flex-shrink-0" />)}
                  <div className={`max-w-[78%] ${m.mine ? 'items-end' : 'items-start'} flex flex-col`}>
                    {runStart && (
                      <span className="mb-0.5 font-mono text-[10px] text-muted">
                        {m.mine ? 'You' : `@${m.author}`} · {clock(m.created_at)}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={m.mine}
                      onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                      aria-label={m.mine ? undefined : `Options for message from ${m.author}`}
                      className={`text-left whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-[14px] leading-snug ${
                        m.mine ? 'bg-brand-black text-white' : 'bg-surface text-brand-black ring-[1.5px] ring-brand-black'
                      }`}
                    >
                      {m.text}
                    </button>
                    {menuFor === m.id && (
                      <div className="mt-1 flex gap-1.5 animate-pop-in">
                        <button onClick={() => report(m)} className="rounded-md px-2.5 py-1 text-[12px] font-semibold ring-[1.5px] ring-brand-black">Report</button>
                        <button onClick={() => block(m)} className="rounded-md bg-brand-black px-2.5 py-1 text-[12px] font-semibold text-white">Block @{m.author}</button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t-[1.5px] border-brand-black px-3 pt-2" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
        {error && <p className="mb-1.5 text-[12px] font-semibold text-brand-black" role="alert">{error}</p>}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="chat-input">Message</label>
          <textarea
            id="chat-input"
            rows={1}
            value={text}
            maxLength={MAX_LEN}
            onChange={(e) => { setText(e.target.value); if (error) setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            placeholder="Message"
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-lg border-[1.5px] border-brand-black bg-surface px-3 py-2.5 text-[15px] text-brand-black placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-black/30"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            aria-label="Send"
            className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg bg-brand-black text-white disabled:opacity-35"
          >
            <SendIcon width={20} height={20} />
          </button>
        </div>
        <p className="mt-1 text-right font-mono text-[10px] text-muted">{text.length}/{MAX_LEN}</p>
      </div>
    </div>,
    document.body,
  )
}
