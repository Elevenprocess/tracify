import { useState } from 'react'
import type { DragEvent, FormEvent, ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { ProspectStatus } from '../lib/format'
import { formatDay } from '../lib/format'
import { PlusIcon, TrashIcon, UsersIcon } from './icons'

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
}> = [
  { status: 'new', label: 'Nouveau', color: 'var(--chart-1)' },
  { status: 'contacted', label: 'Contacté', color: 'var(--status-warn)' },
  { status: 'qualified', label: 'Qualifié', color: 'var(--status-good)' },
  { status: 'lost', label: 'Perdu', color: 'var(--status-muted)' },
]

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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="demo-section-title m-0 flex items-center gap-2">
          <UsersIcon className="h-4 w-4 text-[var(--lagoon)]" />
          {title}
          <span className="font-normal text-[var(--sea-ink-soft)]">
            {prospects.length}
          </span>
        </h2>
        {action}
      </div>

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
              className={`flex min-h-40 flex-col rounded-2xl border p-3 transition-colors ${
                dragOver === col.status
                  ? 'border-[var(--lagoon)] bg-[var(--surface-strong)]'
                  : 'border-[var(--line)] bg-[var(--surface)]'
              }`}
            >
              <p className="island-kicker m-0 mb-3 flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: col.color }}
                  aria-hidden="true"
                />
                {col.label}
                <span className="ml-auto font-normal text-[var(--sea-ink-soft)]">
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
                    className="group cursor-grab rounded-xl border border-[var(--line)] bg-[var(--bg-base)] p-3 active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
                        {p.name}
                      </p>
                      {onRemove && (
                        <button
                          type="button"
                          aria-label={`Supprimer ${p.name}`}
                          onClick={() => {
                            if (window.confirm(`Supprimer « ${p.name} » ?`))
                              onRemove(p.id)
                          }}
                          className="cursor-pointer rounded border-0 bg-transparent p-0.5 text-[var(--sea-ink-soft)] opacity-0 transition-opacity hover:text-[var(--status-warn)] group-hover:opacity-100"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {p.phone && (
                      <p className="m-0 mt-0.5 text-xs text-[var(--sea-ink-soft)]">
                        <a
                          href={`tel:${p.phone.replace(/\s/g, '')}`}
                          className="text-inherit no-underline hover:underline"
                        >
                          {p.phone}
                        </a>
                      </p>
                    )}
                    {p.email && (
                      <p className="m-0 mt-0.5 truncate text-xs text-[var(--sea-ink-soft)]">
                        <a
                          href={`mailto:${p.email}`}
                          className="text-inherit no-underline hover:underline"
                        >
                          {p.email}
                        </a>
                      </p>
                    )}
                    <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">
                      {p.source} · {formatDay(p.date)}
                    </p>
                    <select
                      value={p.status}
                      onChange={(e) =>
                        onSetStatus(p.id, e.target.value as ProspectStatus)
                      }
                      aria-label={`Statut de ${p.name}`}
                      className="mt-2 w-full cursor-pointer rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-xs text-[var(--sea-ink-soft)] outline-none focus:border-[var(--lagoon)] sm:hidden"
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
                  <p className="m-0 rounded-xl border border-dashed border-[var(--line)] px-3 py-4 text-center text-xs text-[var(--sea-ink-soft)]">
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
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[var(--line)] bg-transparent px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink-soft)] hover:border-[var(--lagoon)] hover:text-[var(--sea-ink)]"
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
        className="w-36 rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Téléphone (optionnel)"
        className="w-40 rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
      />
      <button
        type="submit"
        disabled={saving}
        className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-black disabled:opacity-50"
      >
        {saving ? 'Ajout…' : 'Ajouter'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="cursor-pointer rounded-lg border border-[var(--line)] bg-transparent px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink-soft)]"
      >
        Annuler
      </button>
    </form>
  )
}
