import { useEffect, useRef, useState } from 'react'
import { assistantApi } from '../services/api'
import { useAuth } from '../context/auth-context'
import { useGame } from '../context/game-context'

const CHIPS = [
  'How many calories did I eat this week?',
  'How many workouts did I do?',
  'Show my weight progress',
  'Suggest a dinner',
  'Suggest a workout',
]

export default function Assistant() {
  const { user } = useAuth()
  const { applyGame } = useGame()
  const [msgs, setMsgs] = useState([{ from: 'bot', text: "Hi! I'm your Vital coach. Ask me about your meals, workouts or progress." }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadedKey, setLoadedKey] = useState('')
  const endRef = useRef(null)
  const retryRequest = useRef(null)
  const loadKey = `${user?.id || ''}:${loadAttempt}`
  const loading = loadedKey !== loadKey
  const visibleMessages = loading
    ? [{ from: 'bot', text: "Hi! I'm your Vital coach. Ask me about your meals, workouts or progress." }]
    : msgs

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, typing])

  useEffect(() => {
    let active = true

    async function restoreConversation() {
      try {
        const conversations = await assistantApi.listConversations()
        const conversation = conversations.length
          ? await assistantApi.getConversation(conversations[0].id)
          : await assistantApi.createConversation()
        if (!active) return
        setInput('')
        retryRequest.current = null
        setConversationId(conversation.id)
        setError('')
        setMsgs(conversation.messages?.length
          ? conversation.messages.map((message) => ({
            id: message.id,
            from: message.role === 'user' ? 'me' : 'bot',
            text: message.content,
          }))
          : [{ from: 'bot', text: "Hi! I'm your Vital coach. Ask me about your meals, workouts or progress." }])
      } catch (loadError) {
        if (!active) return
        console.error('Failed to restore coach conversation:', loadError)
        setConversationId(null)
        setError('Could not load your saved coach conversation. Please try again.')
      } finally {
        if (active) setLoadedKey(loadKey)
      }
    }

    restoreConversation()
    return () => { active = false }
  }, [user?.id, loadAttempt, loadKey])

  async function send(text) {
    const content = text.trim()
    if (!content || typing || loading || !conversationId) return
    const requestId = retryRequest.current?.content === content
      ? retryRequest.current.requestId
      : crypto.randomUUID()
    setInput('')
    setTyping(true)
    setError('')
    try {
      const result = await assistantApi.sendMessage(conversationId, content, requestId)
      retryRequest.current = null
      setMsgs((messages) => [
        ...messages,
        { id: result.userMessage.id, from: 'me', text: result.userMessage.content },
        { id: result.assistantMessage.id, from: 'bot', text: result.assistantMessage.content },
      ])
      applyGame(result.game, 'chat')
    } catch (error) {
      console.error('Failed to save coach message:', error)
      retryRequest.current = { content, requestId }
      setInput(content)
      setError(error.message || "Your message couldn't be saved. Please try sending it again.")
    } finally {
      setTyping(false)
    }
  }

  return (
    <section className="system-panel page-enter flex h-[75vh] min-h-[480px] flex-col rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3 border-b border-cyan-100/10 pb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-100/15 bg-cyan-100/5 text-xl text-cyan-100" aria-hidden="true">⌁</div>
        <div><p className="system-kicker">VITAL COACH</p><p className="mt-1 text-xs text-gray-500">Your meals, movement, and progress</p></div>
        <span className={`ml-auto flex items-center gap-1.5 text-xs ${typing ? 'text-streak' : 'text-good'}`}><span className={`h-2 w-2 rounded-full ${typing ? 'bg-streak' : 'bg-good'}`} />{typing ? 'Thinking' : 'Ready'}</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto pr-1" role="log" aria-label="Coach conversation" aria-live="polite">
        {visibleMessages.map((m, i) => (
          <div key={m.id || `greeting-${i}`} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
            <p className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%] ${m.from === 'me' ? 'rounded-br-md bg-xp font-medium text-[#06131d]' : 'rounded-bl-md border border-white/5 bg-white/[0.06] text-gray-200'}`}>{m.text}</p>
          </div>
        ))}
        {loading && <p className="text-sm text-gray-400" role="status">Loading your saved conversation…</p>}
        {typing && <p className="animate-pulse text-sm text-gray-400" aria-label="Coach is responding">Coach is thinking<span className="animate-pulse">…</span></p>}
        <div ref={endRef} />
      </div>

      {error && !loading && (
        <div className="my-2 flex items-center justify-between gap-3 text-sm text-red-300" role="alert">
          <span>{error}</span>
          {!conversationId && <button type="button" className="btn-ghost" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</button>}
        </div>
      )}

      <div className="my-3 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button key={c} type="button" disabled={typing || loading || !conversationId} className="btn-ghost min-h-10 text-xs" onClick={() => send(c)}>{c}</button>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex gap-2 border-t border-white/10 pt-3">
        <label className="sr-only" htmlFor="coach-message">Message your coach</label>
        <input id="coach-message" maxLength={500} className="input !mt-0 min-h-12" value={loading ? '' : input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your progress…" disabled={typing || loading || !conversationId} />
        <button className="btn min-h-12 px-5" disabled={typing || loading || !conversationId || !input.trim()}>Send</button>
      </form>
    </section>
  )
}
