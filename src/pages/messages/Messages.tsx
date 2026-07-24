import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { Send, Plus, X, Users2, Check, Search } from 'lucide-react'
import { format, parseISO, isToday, isYesterday } from 'date-fns'

function formatWhen(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`
  return format(d, 'MMM d, h:mm a')
}

export default function Messages() {
  const { currentUser } = useSession()
  const queryClient = useQueryClient()
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [showNewConversation, setShowNewConversation] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: allStaff = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })
  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations', currentUser?.id],
    queryFn: () => api.getConversations(currentUser!.id),
    enabled: !!currentUser,
  })
  const { data: thread = [] } = useQuery({
    queryKey: ['conversation-messages', activeConvId],
    queryFn: () => api.getConversationMessages(activeConvId!),
    enabled: !!activeConvId,
  })

  // Live updates — new messages appear immediately without a refresh, for
  // as long as this page is open (the sidebar badge has its own
  // subscription in AppShell for when this page isn't open).
  useEffect(() => {
    if (!currentUser) return
    const unsubscribe = api.subscribeToMessages(currentUser.id, () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', currentUser.id] })
      queryClient.invalidateQueries({ queryKey: ['conversation-messages'] })
    })
    return unsubscribe
  }, [currentUser, queryClient])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [thread])

  const sendMutation = useMutation({
    mutationFn: (body: string) => api.sendMessage(activeConvId!, body, currentUser!),
    onSuccess: () => {
      setDraft('')
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', activeConvId] })
      queryClient.invalidateQueries({ queryKey: ['conversations', currentUser!.id] })
    },
  })

  const markReadMutation = useMutation({
    mutationFn: (convId: string) => api.markConversationRead(convId, currentUser!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations', currentUser!.id] }),
  })

  const createConversationMutation = useMutation({
    mutationFn: ({ participantIds, name }: { participantIds: string[]; name?: string }) =>
      api.createConversation(participantIds, name, currentUser!),
    onSuccess: (newConvId) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', currentUser!.id] })
      setActiveConvId(newConvId)
      setShowNewConversation(false)
    },
  })

  function openConversation(convId: string) {
    setActiveConvId(convId)
    if (conversations.find((c) => c.id === convId)?.unreadCount) {
      markReadMutation.mutate(convId)
    }
  }

  function conversationLabel(conv: (typeof conversations)[number]): string {
    if (conv.name) return conv.name
    if (conv.isGroup) return conv.participantNames.filter((n) => n !== currentUser?.name).join(', ')
    return conv.participantNames.find((n) => n !== currentUser?.name) ?? conv.participantNames[0] ?? 'Unknown'
  }

  const activeConv = conversations.find((c) => c.id === activeConvId)

  if (!currentUser) return null

  return (
    <div>
      <SectionHeading title="Messages" subtitle="Direct and group messages between staff — live while you're both in the app" />

      <div className="grid grid-cols-[280px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[400px]">
        <Card className="overflow-y-auto p-2">
          <button
            onClick={() => setShowNewConversation(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md mb-1 text-sm font-medium text-[#3b4a35] hover:bg-[#3b4a35]/5"
          >
            <Plus size={15} /> New Message
          </button>

          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 py-1.5">Conversations</div>
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`w-full text-left px-2.5 py-2 rounded-md flex items-center gap-2.5 transition ${
                activeConvId === c.id ? 'bg-[#3b4a35]/10' : 'hover:bg-slate-50'
              }`}
            >
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 bg-[#5f6f4f]">
                {c.isGroup ? <Users2 size={14} /> : conversationLabel(c).split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800 truncate">{conversationLabel(c)}</span>
                  {c.unreadCount > 0 && (
                    <span className="text-[10px] font-semibold bg-[#b3925a] text-white rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shrink-0">{c.unreadCount}</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 truncate">{c.lastMessage?.body ?? 'No messages yet'}</div>
              </div>
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-8 px-2">No conversations yet — start one above.</div>
          )}
        </Card>

        <Card className="flex flex-col overflow-hidden">
          {!activeConvId || !activeConv ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Pick a conversation on the left, or start a new one.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white bg-[#5f6f4f]">
                  {activeConv.isGroup ? <Users2 size={13} /> : conversationLabel(activeConv).split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-800">{conversationLabel(activeConv)}</div>
                  {activeConv.isGroup && <div className="text-xs text-slate-400">{activeConv.participantNames.join(', ')}</div>}
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {thread.map((m) => {
                  const isMine = m.senderId === currentUser.id
                  const senderName = allStaff.find((s) => s.id === m.senderId)?.name ?? 'Unknown'
                  return (
                    <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-lg px-3 py-2 ${isMine ? 'bg-[#3b4a35] text-white' : 'bg-slate-100 text-slate-800'}`}>
                        {activeConv.isGroup && !isMine && (
                          <div className="text-[11px] font-semibold text-[#b3925a] mb-0.5">{senderName}</div>
                        )}
                        <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                        <div className={`text-[10px] mt-0.5 ${isMine ? 'text-white/60' : 'text-slate-400'}`}>{formatWhen(m.createdAt)}</div>
                      </div>
                    </div>
                  )
                })}
                {thread.length === 0 && (
                  <div className="text-sm text-slate-400 text-center py-10">No messages yet — say hi.</div>
                )}
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); if (draft.trim()) sendMutation.mutate(draft.trim()) }}
                className="border-t border-slate-100 px-3 py-2.5 flex items-center gap-2"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sendMutation.isPending}
                  className="bg-[#3b4a35] text-white rounded-md p-2 hover:bg-[#4d5f45] disabled:opacity-50"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </Card>
      </div>

      {showNewConversation && (
        <NewConversationModal
          staff={allStaff.filter((s) => s.id !== currentUser.id && s.active)}
          onCancel={() => setShowNewConversation(false)}
          onCreate={(participantIds, name) => {
            // For a plain 1:1 (not a named group), reopen the existing
            // conversation with that person instead of creating a
            // duplicate — group conversations always create fresh, since
            // someone may genuinely want more than one group with
            // overlapping members.
            if (participantIds.length === 1 && !name) {
              const existing = conversations.find((c) => !c.isGroup && c.participantIds.includes(participantIds[0]))
              if (existing) {
                setActiveConvId(existing.id)
                setShowNewConversation(false)
                return
              }
            }
            createConversationMutation.mutate({ participantIds, name })
          }}
          isPending={createConversationMutation.isPending}
        />
      )}
    </div>
  )
}

function NewConversationModal({
  staff, onCancel, onCreate, isPending,
}: {
  staff: { id: string; name: string; avatarColor?: string }[]
  onCancel: () => void
  onCreate: (participantIds: string[], name?: string) => void
  isPending: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [groupName, setGroupName] = useState('')
  const [search, setSearch] = useState('')
  const isGroup = selected.size > 1

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = search.trim()
    ? staff.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
    : staff

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <Card className="p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">New Message</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {Array.from(selected).map((id) => {
              const person = staff.find((s) => s.id === id)
              if (!person) return null
              return (
                <span key={id} className="inline-flex items-center gap-1 text-xs font-medium bg-[#3b4a35]/10 text-[#3b4a35] rounded-full pl-2.5 pr-1.5 py-1">
                  {person.name}
                  <button onClick={() => toggle(id)} className="hover:bg-[#3b4a35]/20 rounded-full p-0.5"><X size={10} /></button>
                </span>
              )
            })}
          </div>
        )}

        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff…"
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
          />
        </div>
        <div className="text-xs font-medium text-slate-600 mb-1.5">
          Select one person for a direct message, or several to start a group
        </div>
        <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-md divide-y divide-slate-50 mb-3">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50"
            >
              <div className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${selected.has(s.id) ? 'bg-[#3b4a35] border-[#3b4a35]' : 'border-slate-300'}`}>
                {selected.has(s.id) && <Check size={13} className="text-white" />}
              </div>
              <span className="text-sm text-slate-700">{s.name}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="px-3 py-4 text-sm text-slate-400 text-center">No matches.</div>}
        </div>

        {isGroup && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Group name (optional)</label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Cathedral City Team"
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => selected.size > 0 && onCreate(Array.from(selected), isGroup ? (groupName.trim() || undefined) : undefined)}
            disabled={selected.size === 0 || isPending}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 hover:bg-[#4d5f45] disabled:opacity-50"
          >
            {isPending ? 'Starting…' : isGroup ? `Start Group (${selected.size})` : 'Start Conversation'}
          </button>
        </div>
      </Card>
    </div>
  )
}
