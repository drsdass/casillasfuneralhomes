import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSession } from '@/context/SessionContext'
import { canEditCases } from '@/lib/permissions'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { format, parseISO } from 'date-fns'
import { Plus, FolderKanban, HeartHandshake, Gift, Users2, MapPin, X, Pencil } from 'lucide-react'
import type { FamilyInteractionType } from '@/types'
import { ActivityPanel } from '@/components/activity/ActivityPanel'

const interactionLabels: Record<FamilyInteractionType, string> = {
  thank_you_sent: 'Thank-you card sent',
  grief_support: 'Grief support outreach',
  anniversary_outreach: 'Anniversary outreach',
  referral: 'Referral',
  community_event: 'Community event',
  other: 'Other',
}
const interactionIcons: Record<FamilyInteractionType, typeof HeartHandshake> = {
  thank_you_sent: Gift,
  grief_support: HeartHandshake,
  anniversary_outreach: HeartHandshake,
  referral: Users2,
  community_event: MapPin,
  other: Pencil,
}

export default function FamilyDetail() {
  const { familyId } = useParams<{ familyId: string }>()
  const { currentUser } = useSession()
  const queryClient = useQueryClient()
  const canEdit = currentUser ? canEditCases(currentUser.role) : false
  const [showAddInteraction, setShowAddInteraction] = useState(false)
  const [showEditNotes, setShowEditNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')

  const { data: family } = useQuery({ queryKey: ['family', familyId], queryFn: () => api.getFamily(familyId!), enabled: !!familyId })
  const { data: cases = [] } = useQuery({ queryKey: ['family-cases', familyId], queryFn: () => api.getFamilyCases(familyId!), enabled: !!familyId })
  const { data: interactions = [] } = useQuery({ queryKey: ['family-interactions', familyId], queryFn: () => api.getFamilyInteractions(familyId!), enabled: !!familyId })

  const updateNotesMutation = useMutation({
    mutationFn: (notes: string) => api.updateFamily(familyId!, { notes }, currentUser!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family', familyId] })
      setShowEditNotes(false)
    },
  })

  if (!family) return null

  // Merge case creation events with logged interactions into one timeline.
  const timeline = [
    ...cases.map((c) => ({
      kind: 'case' as const, date: c.createdAt,
      label: `Case opened: ${c.decedent.firstName} ${c.decedent.lastName}`, caseId: c.id, caseNumber: c.caseNumber,
    })),
    ...interactions.map((i) => ({
      kind: 'interaction' as const, date: i.createdAt,
      label: interactionLabels[i.type], notes: i.notes, by: i.createdByName, type: i.type,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <Link to="/families" className="text-sm text-slate-500 hover:text-slate-800 mb-4 inline-block">← Back to families</Link>

      <SectionHeading
        title={family.name}
        subtitle={`${cases.length} case${cases.length !== 1 ? 's' : ''} over time`}
        action={
          canEdit ? (
            <button
              onClick={() => setShowAddInteraction(true)}
              className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition"
            >
              <Plus size={16} /> Log Interaction
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-5">
          <Card className="p-5">
            <h3 className="text-sm font-medium text-slate-800 mb-3">Cases</h3>
            <div className="space-y-1">
              {cases.map((c) => (
                <Link
                  key={c.id}
                  to={`/cases/${c.id}`}
                  className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-slate-50 text-sm"
                >
                  <FolderKanban size={14} className="text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-slate-800">{c.decedent.firstName} {c.decedent.lastName}</span>
                    <span className="text-slate-400 ml-2">{c.caseNumber}</span>
                  </div>
                  <span className="text-xs text-slate-400">{format(parseISO(c.createdAt), 'MMM yyyy')}</span>
                </Link>
              ))}
              {cases.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No cases linked yet.</div>}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-medium text-slate-800 mb-3">Timeline</h3>
            <div className="space-y-3">
              {timeline.map((item, i) => {
                const Icon = item.kind === 'case' ? FolderKanban : interactionIcons[item.type]
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      {item.kind === 'case' ? (
                        <Link to={`/cases/${item.caseId}`} className="text-sm text-slate-800 hover:underline">{item.label}</Link>
                      ) : (
                        <>
                          <div className="text-sm text-slate-800">{item.label}</div>
                          <div className="text-xs text-slate-500">{item.notes}</div>
                        </>
                      )}
                      <div className="text-xs text-slate-400 mt-0.5">
                        {format(parseISO(item.date), 'MMM d, yyyy')}{item.kind === 'interaction' && ` · ${item.by}`}
                      </div>
                    </div>
                  </div>
                )
              })}
              {timeline.length === 0 && <div className="text-sm text-slate-400 text-center py-6">Nothing logged yet.</div>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="text-sm font-medium text-slate-800 mb-3">Primary Contact</h3>
            <div className="text-sm text-slate-600 space-y-1">
              <div>{family.primaryContactName ?? '—'}</div>
              <div>{family.primaryContactPhone ?? '—'}</div>
              <div>{family.primaryContactEmail ?? '—'}</div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-800">Notes &amp; Preferences</h3>
              {canEdit && !showEditNotes && (
                <button onClick={() => { setNotesDraft(family.notes ?? ''); setShowEditNotes(true) }} className="text-slate-400 hover:text-slate-600">
                  <Pencil size={13} />
                </button>
              )}
            </div>
            {showEditNotes ? (
              <div>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={4}
                  className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
                  placeholder="Religion, communication preferences, anything staff should know without the family repeating themselves…"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setShowEditNotes(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                  <button
                    onClick={() => updateNotesMutation.mutate(notesDraft)}
                    className="text-xs font-medium bg-[#3b4a35] text-white rounded-md px-2.5 py-1.5 hover:bg-[#4d5f45]"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 whitespace-pre-wrap">{family.notes || 'Nothing noted yet.'}</p>
            )}
          </Card>

          <ActivityPanel entityType="family" entityId={familyId} title="Family Activity" />
        </div>
      </div>

      {showAddInteraction && (
        <AddInteractionModal
          onCancel={() => setShowAddInteraction(false)}
          onSave={(type, notes) => {
            api.addFamilyInteraction(familyId!, type, notes, currentUser!).then(() => {
              queryClient.invalidateQueries({ queryKey: ['family-interactions', familyId] })
              setShowAddInteraction(false)
            })
          }}
        />
      )}
    </div>
  )
}

function AddInteractionModal({
  onCancel, onSave,
}: {
  onCancel: () => void
  onSave: (type: FamilyInteractionType, notes: string) => void
}) {
  const [type, setType] = useState<FamilyInteractionType>('thank_you_sent')
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <Card className="p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Log an interaction</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as FamilyInteractionType)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm">
              {Object.entries(interactionLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              placeholder="What happened…"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => notes.trim() && onSave(type, notes.trim())}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 hover:bg-[#4d5f45]"
          >
            Save
          </button>
        </div>
      </Card>
    </div>
  )
}
