import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, Fragment } from 'react'
import { api } from '@/lib/api'
import { useSession } from '@/context/SessionContext'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { Building2, Mail, Phone, ShieldCheck, ChevronDown, Settings2, History, UserPlus, X, Check, Trash2, Plus } from 'lucide-react'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import { canAssignRoles, canManageAccess, canViewAuditLog, TOGGLEABLE_FEATURES } from '@/lib/permissions'
import { ROLE_LABELS, type UserRole, type VendorCategory, type CaseTask } from '@/types'
import { format, parseISO } from 'date-fns'

const allRoles: UserRole[] = ['super_admin', 'admin', 'manager', 'supervisor', 'staff_member']

const roleBadgeStyles: Record<UserRole, string> = {
  super_admin: 'bg-[#2b3327] text-white',
  admin: 'bg-[#3b4a35] text-white',
  manager: 'bg-emerald-100 text-emerald-800',
  supervisor: 'bg-blue-100 text-blue-800',
  staff_member: 'bg-slate-100 text-slate-700',
}

export default function AdminPage() {
  const { currentUser } = useSession()
  const queryClient = useQueryClient()
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [accessPanelId, setAccessPanelId] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<'staff' | 'vendors' | 'tasks' | 'audit'>('staff')
  const [showAddStaff, setShowAddStaff] = useState(false)
  const canAssign = currentUser ? canAssignRoles(currentUser.role) : false
  const canManage = currentUser ? canManageAccess(currentUser.role) : false
  const canViewAudit = currentUser ? canViewAuditLog(currentUser.role) : false

  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: api.getLocations })
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.getVendors })
  const { data: taskTemplates = [] } = useQuery({ queryKey: ['task-templates'], queryFn: api.getTaskTemplates })
  const { data: auditLog = [] } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => api.getAuditLog(),
    enabled: subTab === 'audit',
  })

  const roleMutation = useMutation({
    mutationFn: ({ staffId, role }: { staffId: string; role: UserRole }) => api.updateStaffRole(staffId, role, currentUser!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      setEditingRoleId(null)
    },
  })

  const locationsMutation = useMutation({
    mutationFn: ({ staffId, locationIds }: { staffId: string; locationIds: string[] }) =>
      api.updateStaffLocations(staffId, locationIds, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  })

  const featuresMutation = useMutation({
    mutationFn: ({ staffId, disabledFeatures }: { staffId: string; disabledFeatures: string[] }) =>
      api.updateStaffFeatures(staffId, disabledFeatures, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  })

  const createStaffMutation = useMutation({
    mutationFn: (input: { name: string; email: string; role: UserRole; title?: string; department?: string; phone?: string; locationIds: string[] }) =>
      api.createStaffMember(input, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  })

  const [showAddVendor, setShowAddVendor] = useState(false)
  const createVendorMutation = useMutation({
    mutationFn: (input: { name: string; category: VendorCategory; email?: string; phone?: string; address?: string; notes?: string }) =>
      api.createVendor({ ...input, orgId: currentUser!.orgId }, currentUser!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vendors'] }); setShowAddVendor(false) },
  })
  const deleteVendorMutation = useMutation({
    mutationFn: (id: string) => api.deleteVendor(id, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendors'] }),
  })

  const [showAddTask, setShowAddTask] = useState(false)
  const createTaskTemplateMutation = useMutation({
    mutationFn: (input: { label: string; category: CaseTask['category']; daysUntilDue?: number }) =>
      api.createTaskTemplate({ ...input, orgId: currentUser!.orgId, sortOrder: taskTemplates.length, active: true }, currentUser!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['task-templates'] }); setShowAddTask(false) },
  })
  const toggleTaskTemplateActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.updateTaskTemplate(id, { active }, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-templates'] }),
  })
  const deleteTaskTemplateMutation = useMutation({
    mutationFn: (id: string) => api.deleteTaskTemplate(id, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-templates'] }),
  })

  function toggleLocation(staffId: string, current: string[], locId: string) {
    const next = current.includes(locId) ? current.filter((id) => id !== locId) : [...current, locId]
    locationsMutation.mutate({ staffId, locationIds: next })
  }

  function toggleFeature(staffId: string, current: string[], key: string) {
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    featuresMutation.mutate({ staffId, disabledFeatures: next })
  }

  return (
    <div>
      <SectionHeading title="Admin" subtitle="Organization-wide locations, staff, and access" />

      <h2 className="text-sm font-medium text-slate-700 mb-3">Locations</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {locations.map((loc) => (
          <Card key={loc.id} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={16} className="text-[#3b4a35]" />
              <span className="font-medium text-slate-900">{loc.name.split('—')[1]?.trim() ?? loc.name}</span>
            </div>
            <div className="text-sm text-slate-500 space-y-0.5">
              <div>{loc.address}</div>
              <div>{loc.city}, {loc.state} {loc.zip}</div>
              <div className="flex items-center gap-1.5 mt-1"><Phone size={12} /> {loc.phone}</div>
              {loc.licenseNumber && (
                <div className="flex items-center gap-1.5"><ShieldCheck size={12} /> License {loc.licenseNumber}</div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-5">
        <button
          onClick={() => setSubTab('staff')}
          className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition ${subTab === 'staff' ? 'border-[#b3925a] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Staff
        </button>
        <button
          onClick={() => setSubTab('vendors')}
          className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition ${subTab === 'vendors' ? 'border-[#b3925a] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Vendors
        </button>
        <button
          onClick={() => setSubTab('tasks')}
          className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition ${subTab === 'tasks' ? 'border-[#b3925a] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Task Templates
        </button>
        {canViewAudit && (
          <button
            onClick={() => setSubTab('audit')}
            className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition inline-flex items-center gap-1.5 ${subTab === 'audit' ? 'border-[#b3925a] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <History size={14} /> Audit Log
          </button>
        )}
      </div>

      {subTab === 'staff' && (
        <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
        <div>
          <div className="flex items-center justify-between mb-3">
            {!canAssign ? (
              <div className="text-xs text-slate-400">Only Super Admin can change roles or manage access.</div>
            ) : <div />}
            {canAssign && (
              <button
                onClick={() => setShowAddStaff(true)}
                className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition"
              >
                <UserPlus size={15} /> Add Staff
              </button>
            )}
          </div>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Location Access</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  {canManage && <th className="px-4 py-3 font-medium text-right">Access</th>}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <Fragment key={s.id}>
                    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                            style={{ backgroundColor: s.avatarColor }}
                          >
                            {s.name.split(' ').map((n) => n[0]).join('')}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{s.name}</div>
                            <div className="text-xs text-slate-500">{s.title}{s.department && ` · ${s.department}`}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 relative">
                        {canAssign ? (
                          <div className="relative inline-block">
                            <button
                              onClick={() => setEditingRoleId(editingRoleId === s.id ? null : s.id)}
                              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${roleBadgeStyles[s.role]}`}
                            >
                              {ROLE_LABELS[s.role]} <ChevronDown size={11} />
                            </button>
                            {editingRoleId === s.id && (
                              <div className="absolute left-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-20 overflow-hidden w-40">
                                {allRoles.map((role) => (
                                  <button
                                    key={role}
                                    onClick={() => roleMutation.mutate({ staffId: s.id, role })}
                                    className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 ${role === s.role ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
                                  >
                                    {ROLE_LABELS[role]}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${roleBadgeStyles[s.role]}`}>
                            {ROLE_LABELS[s.role]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {s.locationIds.length === locations.length
                          ? 'All locations'
                          : s.locationIds.map((id) => locations.find((l) => l.id === id)?.name.split('—')[1]?.trim() ?? id).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        <div className="flex items-center gap-1.5"><Mail size={12} /> {s.email}</div>
                        {s.phone && <div className="flex items-center gap-1.5 mt-0.5"><Phone size={12} /> {s.phone}</div>}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setAccessPanelId(accessPanelId === s.id ? null : s.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                          >
                            <Settings2 size={12} /> Manage
                          </button>
                        </td>
                      )}
                    </tr>
                    {canManage && accessPanelId === s.id && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50 px-4 py-4 border-b border-slate-100">
                          <div className="grid grid-cols-2 gap-8">
                            <div>
                              <div className="text-xs font-semibold text-slate-700 mb-2">Location Access</div>
                              <div className="space-y-1.5">
                                {locations.map((loc) => (
                                  <label key={loc.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={s.locationIds.includes(loc.id)}
                                      onChange={() => toggleLocation(s.id, s.locationIds, loc.id)}
                                      className="accent-[#3b4a35]"
                                    />
                                    {loc.name.split('—')[1]?.trim() ?? loc.name}
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-slate-700 mb-2">Feature Access</div>
                              <div className="space-y-1.5">
                                {TOGGLEABLE_FEATURES.map((f) => {
                                  const disabled = (s.disabledFeatures ?? []).includes(f.key)
                                  return (
                                    <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={!disabled}
                                        onChange={() => toggleFeature(s.id, s.disabledFeatures ?? [], f.key)}
                                        className="accent-[#3b4a35]"
                                      />
                                      {f.label}
                                    </label>
                                  )
                                })}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-2">Unchecking a feature blocks it for this person even though their role would normally allow it.</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <ActivityPanel entityType="staff" title="Staff Activity" />
        </div>
      )}

      {subTab === 'vendors' && (
        <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-slate-400">Who documents get sent to — removal companies, crematories, florists, and more.</div>
            <button
              onClick={() => setShowAddVendor(true)}
              className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition shrink-0"
            >
              <Plus size={15} /> Add Vendor
            </button>
          </div>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium text-right">Remove</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-slate-800">{v.name}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{v.category.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {v.email && <div className="flex items-center gap-1.5"><Mail size={12} /> {v.email}</div>}
                      {v.phone && <div className="flex items-center gap-1.5 mt-0.5"><Phone size={12} /> {v.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { if (confirm(`Remove vendor "${v.name}"?`)) deleteVendorMutation.mutate(v.id) }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {vendors.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No vendors yet.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
        <ActivityPanel entityType="vendor" title="Vendor Activity" />
        </div>
      )}

      {subTab === 'tasks' && (
        <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-slate-400">The standard checklist every new case starts with. Changes here don't affect existing cases' tasks.</div>
            <button
              onClick={() => setShowAddTask(true)}
              className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition shrink-0"
            >
              <Plus size={15} /> Add Task
            </button>
          </div>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-3 font-medium">Task</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Active</th>
                  <th className="px-4 py-3 font-medium text-right">Remove</th>
                </tr>
              </thead>
              <tbody>
                {taskTemplates.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-slate-800">{t.label}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{t.category.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-slate-500">{t.daysUntilDue != null ? `${t.daysUntilDue} day${t.daysUntilDue !== 1 ? 's' : ''} out` : '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleTaskTemplateActiveMutation.mutate({ id: t.id, active: !t.active })}
                        className={`text-xs font-medium px-2 py-1 rounded-full ${t.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {t.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { if (confirm(`Remove task template "${t.label}"?`)) deleteTaskTemplateMutation.mutate(t.id) }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {taskTemplates.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No task templates yet.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
        <ActivityPanel entityType="task" title="Task Activity" />
        </div>
      )}

      {subTab === 'audit' && (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">What happened</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{format(parseISO(entry.timestamp), 'MMM d, h:mm:ss a')}</td>
                  <td className="px-4 py-3 text-slate-700">{entry.changedByName}</td>
                  <td className="px-4 py-3 text-slate-500 capitalize">{entry.entityType}</td>
                  <td className="px-4 py-3 text-slate-800">{entry.summary}</td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No activity recorded yet this session.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showAddStaff && (
        <AddStaffModal
          locations={locations}
          onCancel={() => setShowAddStaff(false)}
          onCreate={(input) => createStaffMutation.mutate(input)}
          isPending={createStaffMutation.isPending}
          error={createStaffMutation.isError ? (createStaffMutation.error instanceof Error ? createStaffMutation.error.message : 'Unknown error') : null}
          createdPassword={createStaffMutation.isSuccess ? createStaffMutation.data.tempPassword : null}
          onDone={() => { setShowAddStaff(false); createStaffMutation.reset() }}
        />
      )}

      {showAddVendor && (
        <AddVendorModal
          onCancel={() => setShowAddVendor(false)}
          onCreate={(input) => createVendorMutation.mutate(input)}
          isPending={createVendorMutation.isPending}
        />
      )}

      {showAddTask && (
        <AddTaskTemplateModal
          onCancel={() => setShowAddTask(false)}
          onCreate={(input) => createTaskTemplateMutation.mutate(input)}
          isPending={createTaskTemplateMutation.isPending}
        />
      )}
    </div>
  )
}

function AddStaffModal({
  locations, onCancel, onCreate, isPending, error, createdPassword, onDone,
}: {
  locations: { id: string; name: string }[]
  onCancel: () => void
  onCreate: (input: { name: string; email: string; role: UserRole; title?: string; department?: string; phone?: string; locationIds: string[] }) => void
  isPending: boolean
  error: string | null
  createdPassword: string | null
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('staff_member')
  const [title, setTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [locationIds, setLocationIds] = useState<string[]>([])

  if (createdPassword) {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
        <Card className="p-5 w-full max-w-sm">
          <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <Check size={20} />
          </div>
          <div className="text-sm font-medium text-slate-800 text-center mb-1">{name} was added</div>
          <div className="text-xs text-slate-500 text-center mb-4">
            Temporary password: <span className="font-mono font-semibold text-slate-700">{createdPassword}</span>
            <br />Share this with them directly — they should change it on first login.
          </div>
          <button onClick={onDone} className="w-full bg-[#3b4a35] text-white text-sm font-medium py-2 rounded-md hover:bg-[#4d5f45]">Done</button>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <Card className="p-5 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Add Staff</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm">
                {allRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Title (optional)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Manager, Staff Member, etc." className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Location Access</label>
            <div className="flex flex-wrap gap-2">
              {locations.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLocationIds((prev) => prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id])}
                  className={`text-xs font-medium px-2.5 py-1.5 rounded-md border ${
                    locationIds.includes(l.id) ? 'bg-[#3b4a35] text-white border-[#3b4a35]' : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mt-3">{error}</div>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => name.trim() && email.trim() && locationIds.length > 0 && onCreate({ name: name.trim(), email: email.trim(), role, title: title.trim() || undefined, phone: phone.trim() || undefined, locationIds })}
            disabled={!name.trim() || !email.trim() || locationIds.length === 0 || isPending}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 hover:bg-[#4d5f45] disabled:opacity-50"
          >
            {isPending ? 'Creating…' : 'Create Staff Member'}
          </button>
        </div>
      </Card>
    </div>
  )
}

const vendorCategoryLabels: Record<VendorCategory, string> = {
  removal_company: 'Removal Company',
  crematory: 'Crematory',
  cemetery: 'Cemetery',
  florist: 'Florist',
  doctor_office: "Doctor's Office",
  hospice: 'Hospice',
  church: 'Church',
  printing: 'Printing',
  other: 'Other',
}

function AddVendorModal({
  onCancel, onCreate, isPending,
}: {
  onCancel: () => void
  onCreate: (input: { name: string; category: VendorCategory; email?: string; phone?: string; address?: string; notes?: string }) => void
  isPending: boolean
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<VendorCategory>('removal_company')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <Card className="p-5 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Add Vendor</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as VendorCategory)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm">
                {Object.entries(vendorCategoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Address (optional)</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => name.trim() && onCreate({ name: name.trim(), category, email: email.trim() || undefined, phone: phone.trim() || undefined, address: address.trim() || undefined })}
            disabled={!name.trim() || isPending}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 hover:bg-[#4d5f45] disabled:opacity-50"
          >
            {isPending ? 'Adding…' : 'Add Vendor'}
          </button>
        </div>
      </Card>
    </div>
  )
}

const taskCategoryLabels: Record<CaseTask['category'], string> = {
  permits: 'Permits', merchandise: 'Merchandise', service_prep: 'Service Prep',
  family: 'Family', documents: 'Documents', transport: 'Transport', other: 'Other',
}

function AddTaskTemplateModal({
  onCancel, onCreate, isPending,
}: {
  onCancel: () => void
  onCreate: (input: { label: string; category: CaseTask['category']; daysUntilDue?: number }) => void
  isPending: boolean
}) {
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState<CaseTask['category']>('documents')
  const [daysUntilDue, setDaysUntilDue] = useState('')

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <Card className="p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Add Task Template</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Task</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as CaseTask['category'])} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm">
                {Object.entries(taskCategoryLabels).map(([key, l]) => <option key={key} value={key}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Days until due</label>
              <input type="number" min="0" value={daysUntilDue} onChange={(e) => setDaysUntilDue(e.target.value)} placeholder="Optional" className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => label.trim() && onCreate({ label: label.trim(), category, daysUntilDue: daysUntilDue ? Number(daysUntilDue) : undefined })}
            disabled={!label.trim() || isPending}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 hover:bg-[#4d5f45] disabled:opacity-50"
          >
            {isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </Card>
    </div>
  )
}
