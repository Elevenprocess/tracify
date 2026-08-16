import { useState } from 'react'
import type { DragEvent, FormEvent, ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { ProspectStatus } from '../lib/format'
import { formatDay } from '../lib/format'
import { MailIcon, PhoneIcon, PlusIcon, TrashIcon, UsersIcon } from './icons'
import { SectionTitle } from './ui'

export interface Prospect {
  id: Id<'prospects'>
  name: string
  phone: string
  email?: string
  date: string
  source: string
  medium: string
  status: ProspectStatus
}

const COLUMNS: Array<{
  status: ProspectStatus
  label: string
  color: string
  tint: string
}> = [
  {
    status: 'new',
    label: 'Nouveau',
    color: 'var(--lagoon)',
    tint: 'rgba(96,215,207,0.12)',
  },
  {
    status: 'contacted',
    label: 'Contacté',
    color: 'var(--status-warn)',
    tint: 'rgba(217,160,74,0.12)',
  },
  {
    status: 'qualified',
    label: 'Qualifié',
    color: 'var(--status-good)',
    tint: 'rgba(88,193,132,0.12)',
  },
  {
    status: 'lost',
    label: 'Perdu',
    color: 'var(--status-muted)',
    tint: 'rgba(138,165,161,0.12)',
  },
]

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?'

// Kanban admin d'une campagne : lecture, statut, suppression, ajout manuel.
export default function ProspectsBoard({
  campaignId,
  initial,
}: {
  campaignId: string
  initial?: Array<Prospect>
}) {
  const live = useQuery(api.prospects.byCampaign, { campaignId })
  const setStatus = useMutation(api.prospects.setStatus)
  const removeProspect = useMutation(api.prospects.remove)
  return (
    <PipelineBoard
      prospects={live ?? initial ?? []}
      onSetStatus={(id, status) => setStatus({ id, status })}
      onRemove={(id) => removeProspect({ id })}
      action={<AddProspectForm campaignId={campaignId} />}
    />
  )
}

// Kanban admin de tous les prospects d'un client (toutes campagnes, y compris
// ceux arrivés par le webhook sans campagne).
export function ClientProspectsBoard({ clientSlug }: { clientSlug: string }) {
  const live = useQuery(api.prospects.byClient, { clientSlug })
  const setStatus = useMutation(api.prospects.setStatus)
  const removeProspect = useMutation(api.prospects.remove)
  return (
    <PipelineBoard
      title="Pipeline prospects"
      prospects={live ?? []}
      onSetStatus={(id, status) => setStatus({ id, status })}
      onRemove={(id) => removeProspect({ id })}
    />
  )
}

// Kanban générique : la source des données et les actions sont injectées,
// ce qui permet de le réutiliser dans l'espace client (accès par code).
export function PipelineBoard({
  prospects,
  onSetStatus,
  onRemove,
  action,
  title = 'CRM prospects',
  emptyHint = 'Glisse un prospect ici',
}: {
  prospects: Array<Prospect>
  onSetStatus: (id: Id<'prospects'>, status: ProspectStatus) => void
  onRemove?: (id: Id<'prospects'>) => void
  action?: ReactNode
  title?: string
  emptyHint?: string
}) {
  const [dragOver, setDragOver] = useState<ProspectStatus | null>(null)

  const onDrop = (e: DragEvent, status: ProspectStatus) => {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/prospect-id')
    if (id) onSetStatus(id as Id<'prospects'>, status)
  }

  return (
    <section className="mt-6">
      <SectionTitle icon={<UsersIcon className="h-4 w-4" />} aside={action}>
        {title}
        <span className="tabular font-semibold text-[var(--sea-ink-faint)]">
          {prospects.length}
        </span>
      </SectionTitle>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const cards = prospects.filter((p) => p.status === col.status)
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(col.status)
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => onDrop(e, col.status)}
              className={`flex min-h-44 flex-col rounded-2xl border p-2.5 transition-colors ${
                dragOver === col.status
                  ? 'border-[var(--lagoon)] bg-[var(--lagoon-tint)]'
                  : 'border-[var(--line)] bg-[var(--surface)]'
              }`}
            >
              <p className="m-0 mb-2.5 flex items-center gap-2 px-1 text-xs font-bold text-[var(--sea-ink)]">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: col.color }}
                  aria-hidden="true"
                />
                {col.label}
                <span
                  className="tabular ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                  style={{ background: col.tint, color: col.color }}
                >
                  {cards.length}
                </span>
              </p>

              <div className="flex flex-1 flex-col gap-2">
                {cards.map((p) => (
                  <article
                    key={p.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData('text/prospect-id', p.id)
                    }
                    className="group cursor-grab rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] p-3 transition-colors hover:border-[var(--line-strong)] active:cursor-grabbing"
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold"
                        style={{ background: col.tint, color: col.color }}
                        aria-hidden="true"
                      >
                        {initials(p.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate text-sm font-semibold text-[var(--sea-ink)]">
                          {p.name}
                        </p>
                        <p className="m-0 mt-0.5 text-[11px] text-[var(--sea-ink-faint)]">
                          {p.source} · {formatDay(p.date)}
                        </p>
                      </div>
                      {onRemove && (
                        <button
                          type="button"
                          aria-label={`Supprimer ${p.name}`}
                          onClick={() => {
                            if (window.confirm(`Supprimer « ${p.name} » ?`))
                              onRemove(p.id)
                          }}
                          className="-mr-1 -mt-1 cursor-pointer rounded-md border-0 bg-transparent p-1 text-[var(--sea-ink-faint)] opacity-0 transition-opacity hover:text-[var(--status-bad)] focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {(p.phone || p.email) && (
                      <div className="mt-2.5 flex flex-col gap-1 border-t border-[var(--line)] pt-2">
                        {p.phone && (
                          <a
                            href={`tel:${p.phone.replace(/\s/g, '')}`}
                            className="tabular flex items-center gap-1.5 text-xs text-[var(--sea-ink-soft)] no-underline hover:text-[var(--lagoon)]"
                          >
                            <PhoneIcon className="h-3 w-3 flex-shrink-0" />
                            {p.phone}
                          </a>
                        )}
                        {p.email && (
                          <a
                            href={`mailto:${p.email}`}
                            className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--sea-ink-soft)] no-underline hover:text-[var(--lagoon)]"
                          >
                            <MailIcon className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{p.email}</span>
                          </a>
                        )}
                      </div>
                    )}
                    <select
                      value={p.status}
                      onChange={(e) =>
                        onSetStatus(p.id, e.target.value as ProspectStatus)
                      }
                      aria-label={`Statut de ${p.name}`}
                      className="field mt-2 cursor-pointer py-1 text-xs sm:hidden"
                    >
                      {COLUMNS.map((c) => (
                        <option
                          key={c.status}
                          value={c.status}
                          className="bg-[var(--surface-solid)]"
                        >
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
                {cards.length === 0 && (
                  <p className="m-0 flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--line)] px-3 py-5 text-center text-xs text-[var(--sea-ink-faint)]">
                    {emptyHint}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function AddProspectForm({ campaignId }: { campaignId: string }) {
  const addProspect = useMutation(api.prospects.add)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      await addProspect({ campaignId, name, phone: phone || undefined })
      setName('')
      setPhone('')
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-dashed btn-sm"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Ajouter un prospect
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
        placeholder="Nom"
        className="field w-36 py-1.5"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Téléphone (optionnel)"
        className="field w-44 py-1.5"
      />
      <button
        type="submit"
        disabled={saving}
        className="btn btn-primary btn-sm"
      >
        {saving ? 'Ajout…' : 'Ajouter'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="btn btn-ghost btn-sm"
      >
        Annuler
      </button>
    </form>
  )
}
