import { useEffect, useState } from 'react'
import type { DragEvent, FormEvent, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { ProspectStatus } from '../lib/format'
import { formatAgo, formatDateTime, formatDay, isRecent } from '../lib/format'
import {
  ClockIcon,
  ExternalLinkIcon,
  MailIcon,
  MegaphoneIcon,
  NoteIcon,
  PhoneIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
  UsersIcon,
  WebhookIcon,
  XIcon,
} from './icons'
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
  campaignId?: string | null
  viaWebhook?: boolean
  createdAt?: string
  history?: Array<{ status: string; at: string; by?: string }>
  notes?: string
  clientNotes?: string
}

export const COLUMNS: Array<{
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

const columnOf = (status: string) =>
  COLUMNS.find((c) => c.status === status) ?? COLUMNS[0]

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?'

const isNew = (p: Prospect) =>
  p.status === 'new' && !!p.createdAt && isRecent(p.createdAt)

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
  const setNotes = useMutation(api.prospects.setNotes)
  const setClientNotes = useMutation(api.prospects.setClientNotes)
  const removeProspect = useMutation(api.prospects.remove)
  return (
    <PipelineBoard
      prospects={live ?? initial ?? []}
      onSetStatus={(id, status) => setStatus({ id, status })}
      onSaveNotes={(id, notes) => setNotes({ id, notes })}
      onSaveClientNotes={(id, notes) => setClientNotes({ id, notes })}
      onRemove={(id) => removeProspect({ id })}
      action={<AddProspectForm campaignId={campaignId} />}
    />
  )
}

// Kanban admin de tous les prospects d'un client (toutes campagnes, y compris
// ceux arrivés par le webhook sans campagne).
export function ClientProspectsBoard({ clientSlug }: { clientSlug: string }) {
  const live = useQuery(api.prospects.byClient, { clientSlug })
  const campaigns = useQuery(api.meta.campaignsByClient, { clientSlug })
  const setStatus = useMutation(api.prospects.setStatus)
  const setNotes = useMutation(api.prospects.setNotes)
  const setClientNotes = useMutation(api.prospects.setClientNotes)
  const removeProspect = useMutation(api.prospects.remove)
  const campaignNames: Record<string, string> = {}
  for (const c of campaigns ?? [])
    campaignNames[c.metaId] = c.name ?? `Campagne ${c.metaId}`
  return (
    <PipelineBoard
      title="Pipeline prospects"
      prospects={live ?? []}
      campaignNames={campaignNames}
      linkCampaigns
      onSetStatus={(id, status) => setStatus({ id, status })}
      onSaveNotes={(id, notes) => setNotes({ id, notes })}
      onSaveClientNotes={(id, notes) => setClientNotes({ id, notes })}
      onRemove={(id) => removeProspect({ id })}
    />
  )
}

// Kanban générique : la source des données et les actions sont injectées,
// ce qui permet de le réutiliser dans l'espace client (accès par code).
export function PipelineBoard({
  prospects,
  onSetStatus,
  onSaveNotes,
  onSaveClientNotes,
  onRemove,
  action,
  title = 'CRM prospects',
  emptyHint = 'Glisse un prospect ici',
  campaignNames = {},
  linkCampaigns = false,
}: {
  prospects: Array<Prospect>
  onSetStatus: (id: Id<'prospects'>, status: ProspectStatus) => void
  // Absent = notes internes masquées (espace client)
  onSaveNotes?: (id: Id<'prospects'>, notes: string) => void
  // Notes du client (espace client + aperçu admin)
  onSaveClientNotes?: (id: Id<'prospects'>, notes: string) => void
  onRemove?: (id: Id<'prospects'>) => void
  action?: ReactNode
  title?: string
  emptyHint?: string
  campaignNames?: Record<string, string>
  // Admin : la campagne du prospect est cliquable
  linkCampaigns?: boolean
}) {
  const [dragOver, setDragOver] = useState<ProspectStatus | null>(null)
  const [onlyNew, setOnlyNew] = useState(false)
  const [openId, setOpenId] = useState<Id<'prospects'> | null>(null)

  const newCount = prospects.filter(isNew).length
  const shown = onlyNew ? prospects.filter(isNew) : prospects
  const open = openId ? (prospects.find((p) => p.id === openId) ?? null) : null

  const onDrop = (e: DragEvent, status: ProspectStatus) => {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/prospect-id')
    if (id) onSetStatus(id as Id<'prospects'>, status)
  }

  return (
    <section className="mt-6">
      <SectionTitle
        icon={<UsersIcon className="h-4 w-4" />}
        aside={
          <div className="flex flex-wrap items-center gap-2">
            {newCount > 0 && (
              <button
                type="button"
                aria-pressed={onlyNew}
                onClick={() => setOnlyNew((v) => !v)}
                className={`btn btn-sm ${onlyNew ? 'btn-primary' : 'btn-secondary'}`}
              >
                <SparkleIcon className="h-3.5 w-3.5" />
                {newCount} {newCount > 1 ? 'nouveaux' : 'nouveau'} (24 h)
              </button>
            )}
            {action}
          </div>
        }
      >
        {title}
        <span className="tabular font-semibold text-[var(--sea-ink-faint)]">
          {prospects.length}
        </span>
      </SectionTitle>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const cards = shown.filter((p) => p.status === col.status)
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

              {/* Hauteur bornée : la colonne défile en interne, la page ne
                  s'allonge pas avec le nombre de prospects. */}
              <div className="flex max-h-[34rem] flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5">
                {cards.map((p) => (
                  <ProspectCard
                    key={p.id}
                    prospect={p}
                    color={col.color}
                    tint={col.tint}
                    campaignName={
                      p.campaignId ? campaignNames[p.campaignId] : undefined
                    }
                    onOpen={() => setOpenId(p.id)}
                    onSetStatus={onSetStatus}
                    onRemove={onRemove}
                  />
                ))}
                {cards.length === 0 && (
                  <p className="m-0 flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--line)] px-3 py-5 text-center text-xs text-[var(--sea-ink-faint)]">
                    {onlyNew ? 'Aucun nouveau prospect' : emptyHint}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {open && (
        <ProspectDialog
          prospect={open}
          campaignName={
            open.campaignId ? campaignNames[open.campaignId] : undefined
          }
          linkCampaign={linkCampaigns}
          onClose={() => setOpenId(null)}
          onSetStatus={onSetStatus}
          onSaveNotes={onSaveNotes}
          onSaveClientNotes={onSaveClientNotes}
          onRemove={
            onRemove
              ? (id) => {
                  onRemove(id)
                  setOpenId(null)
                }
              : undefined
          }
        />
      )}
    </section>
  )
}

function ProspectCard({
  prospect: p,
  color,
  tint,
  campaignName,
  onOpen,
  onSetStatus,
  onRemove,
}: {
  prospect: Prospect
  color: string
  tint: string
  campaignName?: string
  onOpen: () => void
  onSetStatus: (id: Id<'prospects'>, status: ProspectStatus) => void
  onRemove?: (id: Id<'prospects'>) => void
}) {
  const fresh = isNew(p)
  return (
    <article
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/prospect-id', p.id)}
      className={`group cursor-grab rounded-xl border bg-[var(--surface-solid)] p-3 transition-colors hover:border-[var(--line-strong)] active:cursor-grabbing ${
        fresh ? 'border-[var(--lagoon-line)]' : 'border-[var(--line)]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold"
          style={{ background: tint, color }}
          aria-hidden="true"
        >
          {initials(p.name)}
          {fresh && (
            <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--lagoon)] opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--lagoon)]" />
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
          aria-label={`Ouvrir la fiche de ${p.name}`}
        >
          <p className="m-0 truncate text-sm font-semibold text-[var(--sea-ink)] hover:text-[var(--lagoon)]">
            {p.name}
          </p>
          <p className="m-0 mt-0.5 flex items-center gap-1 text-[11px] text-[var(--sea-ink-faint)]">
            {p.viaWebhook && (
              <WebhookIcon className="h-3 w-3 flex-shrink-0 text-[var(--lagoon)]" />
            )}
            <span className="truncate">
              {p.source} · {formatDay(p.date)}
            </span>
          </p>
          {campaignName && (
            <p className="m-0 mt-1 flex items-center gap-1 truncate text-[11px] text-[var(--sea-ink-soft)]">
              <MegaphoneIcon className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{campaignName}</span>
            </p>
          )}
        </button>
        {onRemove && (
          <button
            type="button"
            aria-label={`Supprimer ${p.name}`}
            onClick={() => {
              if (window.confirm(`Supprimer « ${p.name} » ?`)) onRemove(p.id)
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
      {p.notes && (
        <p className="m-0 mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-[var(--sea-ink-soft)]">
          <NoteIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span className="line-clamp-2">{p.notes}</span>
        </p>
      )}
      <select
        value={p.status}
        onChange={(e) => onSetStatus(p.id, e.target.value as ProspectStatus)}
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
  )
}

const BY_LABELS: Record<string, string> = {
  admin: 'par Eleven Process',
  client: 'par le client',
  webhook: 'reçu automatiquement',
  ghl: 'synchronisé depuis GoHighLevel',
}

// Dossier d'un prospect (fenêtre) : identité et coordonnées, provenance,
// campagne, statut, historique d'activité et notes — à la manière d'une
// fiche contact GHL. Les notes internes n'apparaissent que côté admin ; les
// notes du client sont partagées entre l'espace client et l'admin.
export function ProspectDialog({
  prospect: p,
  campaignName,
  linkCampaign,
  onClose,
  onSetStatus,
  onSaveNotes,
  onSaveClientNotes,
  onRemove,
}: {
  prospect: Prospect
  campaignName?: string
  linkCampaign?: boolean
  onClose: () => void
  onSetStatus: (id: Id<'prospects'>, status: ProspectStatus) => void
  onSaveNotes?: (id: Id<'prospects'>, notes: string) => void
  onSaveClientNotes?: (id: Id<'prospects'>, notes: string) => void
  onRemove?: (id: Id<'prospects'>) => void
}) {
  const col = columnOf(p.status)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const history = [...(p.history ?? [])].sort((a, b) =>
    b.at.localeCompare(a.at),
  )
  const arrival = p.viaWebhook ? 'Reçu automatiquement' : 'Saisi à la main'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fermer le dossier"
        onClick={onClose}
        className="absolute inset-0 cursor-default border-0 bg-[rgba(4,18,22,0.6)] p-0 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Dossier de ${p.name}`}
        className="rise-in relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--surface-solid)] shadow-2xl sm:rounded-2xl"
      >
        {/* En-tête */}
        <header className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <span
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-sm font-extrabold"
            style={{ background: col.tint, color: col.color }}
            aria-hidden="true"
          >
            {initials(p.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="island-kicker m-0">Dossier prospect</p>
            <h3 className="m-0 truncate text-lg font-extrabold text-[var(--sea-ink)] sm:text-xl">
              {p.name}
            </h3>
            <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--sea-ink-soft)]">
              <span className="inline-flex items-center gap-1">
                {p.viaWebhook && (
                  <WebhookIcon className="h-3 w-3 text-[var(--lagoon)]" />
                )}
                {arrival}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {p.createdAt ? formatAgo(p.createdAt) : formatDay(p.date)}
              </span>
              {campaignName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <MegaphoneIcon className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{campaignName}</span>
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {p.phone && (
              <a
                href={`tel:${p.phone.replace(/\s/g, '')}`}
                className="btn btn-primary btn-sm"
              >
                <PhoneIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Appeler</span>
              </a>
            )}
            {p.email && (
              <a
                href={`mailto:${p.email}`}
                className="btn btn-secondary btn-sm"
              >
                <MailIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Écrire</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="btn btn-ghost btn-sm px-2"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Corps : dossier à gauche, activité + notes à droite */}
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="flex flex-col gap-6 px-5 py-5 sm:px-6 md:border-r md:border-[var(--line)]">
            <section>
              <p className="island-kicker m-0 mb-2">Statut</p>
              <div className="flex flex-wrap gap-1.5">
                {COLUMNS.map((c) => {
                  const active = c.status === p.status
                  return (
                    <button
                      key={c.status}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSetStatus(p.id, c.status)}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors"
                      style={
                        active
                          ? {
                              background: c.tint,
                              color: c.color,
                              borderColor: c.color,
                            }
                          : {
                              background: 'transparent',
                              color: 'var(--sea-ink-soft)',
                              borderColor: 'var(--line)',
                            }
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: c.color }}
                        aria-hidden="true"
                      />
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </section>

            <section>
              <p className="island-kicker m-0 mb-2">Coordonnées</p>
              <dl className="m-0 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-xs text-[var(--sea-ink-faint)]">
                  Téléphone
                </dt>
                <dd className="tabular m-0 min-w-0">
                  {p.phone ? (
                    <a
                      href={`tel:${p.phone.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-1.5 text-[var(--sea-ink)] no-underline hover:text-[var(--lagoon)]"
                    >
                      <PhoneIcon className="h-3 w-3" />
                      {p.phone}
                    </a>
                  ) : (
                    <span className="text-[var(--sea-ink-faint)]">—</span>
                  )}
                </dd>
                <dt className="text-xs text-[var(--sea-ink-faint)]">Email</dt>
                <dd className="m-0 min-w-0 truncate">
                  {p.email ? (
                    <a
                      href={`mailto:${p.email}`}
                      className="inline-flex max-w-full items-center gap-1.5 text-[var(--sea-ink)] no-underline hover:text-[var(--lagoon)]"
                    >
                      <MailIcon className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{p.email}</span>
                    </a>
                  ) : (
                    <span className="text-[var(--sea-ink-faint)]">—</span>
                  )}
                </dd>
              </dl>
            </section>

            <section>
              <p className="island-kicker m-0 mb-2">Provenance</p>
              <dl className="m-0 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-xs text-[var(--sea-ink-faint)]">Source</dt>
                <dd className="m-0">
                  {p.source}
                  {p.medium && p.medium !== '—' && (
                    <span className="text-[var(--sea-ink-soft)]">
                      {' '}
                      · {p.medium}
                    </span>
                  )}
                </dd>
                <dt className="text-xs text-[var(--sea-ink-faint)]">Arrivée</dt>
                <dd className="m-0">
                  {p.createdAt
                    ? formatDateTime(p.createdAt)
                    : formatDay(p.date)}
                </dd>
                <dt className="text-xs text-[var(--sea-ink-faint)]">
                  Campagne
                </dt>
                <dd className="m-0 min-w-0">
                  {p.campaignId ? (
                    linkCampaign ? (
                      <Link
                        to="/campagnes/$campaignId"
                        params={{ campaignId: p.campaignId }}
                        className="inline-flex max-w-full items-center gap-1.5 text-[var(--sea-ink)] no-underline hover:text-[var(--lagoon)]"
                      >
                        <MegaphoneIcon className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">
                          {campaignName ?? p.campaignId}
                        </span>
                        <ExternalLinkIcon className="h-3 w-3 flex-shrink-0" />
                      </Link>
                    ) : (
                      <span className="inline-flex max-w-full items-center gap-1.5">
                        <MegaphoneIcon className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">
                          {campaignName ?? p.campaignId}
                        </span>
                      </span>
                    )
                  ) : (
                    <span className="text-[var(--sea-ink-faint)]">
                      Non rattaché
                    </span>
                  )}
                </dd>
              </dl>
            </section>

            {onRemove && (
              <div className="mt-auto pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Supprimer « ${p.name} » ?`))
                      onRemove(p.id)
                  }}
                  className="btn btn-danger btn-sm"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Supprimer ce prospect
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6 border-t border-[var(--line)] px-5 py-5 sm:px-6 md:border-t-0">
            {onSaveClientNotes && (
              <NotesEditor
                id="dialog-client-notes"
                label={onSaveNotes ? 'Notes du client' : 'Vos notes'}
                hint={
                  onSaveNotes
                    ? 'Saisies par le client dans son espace de suivi.'
                    : 'Retour d’appel, besoin, rendez-vous… partagées avec Eleven Process.'
                }
                value={p.clientNotes ?? ''}
                onSave={(v) => onSaveClientNotes(p.id, v)}
              />
            )}
            {onSaveNotes && (
              <NotesEditor
                id="dialog-notes"
                label="Notes internes"
                hint="Visibles seulement par l’équipe."
                value={p.notes ?? ''}
                onSave={(v) => onSaveNotes(p.id, v)}
              />
            )}
            {!onSaveNotes && !onSaveClientNotes && p.clientNotes && (
              <section>
                <p className="island-kicker m-0 mb-2">Notes</p>
                <p className="m-0 whitespace-pre-wrap text-sm text-[var(--sea-ink)]">
                  {p.clientNotes}
                </p>
              </section>
            )}
            {onSaveNotes && !onSaveClientNotes && p.clientNotes && (
              <section>
                <p className="island-kicker m-0 mb-2">Notes du client</p>
                <p className="m-0 whitespace-pre-wrap rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-[var(--sea-ink)]">
                  {p.clientNotes}
                </p>
              </section>
            )}

            <section>
              <p className="island-kicker m-0 mb-2 flex items-center gap-1.5">
                <ClockIcon className="h-3 w-3" />
                Activité
              </p>
              <ol className="m-0 flex list-none flex-col gap-0 p-0">
                {history.map((h, i) => {
                  const c = columnOf(h.status)
                  return (
                    <li
                      key={`${h.at}-${i}`}
                      className="relative flex gap-3 pb-3 pl-1 last:pb-0"
                    >
                      {i < history.length - 1 && (
                        <span
                          className="absolute left-[7px] top-4 h-full w-px bg-[var(--line)]"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className="relative mt-1 h-3 w-3 flex-shrink-0 rounded-full border-2 border-[var(--surface-solid)]"
                        style={{ background: c.color }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 text-sm">
                        <p className="m-0 font-semibold text-[var(--sea-ink)]">
                          {i === history.length - 1
                            ? p.viaWebhook
                              ? 'Reçu — Nouveau'
                              : 'Créé — Nouveau'
                            : `Passé en « ${c.label} »`}
                          {h.by && BY_LABELS[h.by] && (
                            <span className="font-normal text-[var(--sea-ink-soft)]">
                              {' '}
                              {BY_LABELS[h.by]}
                            </span>
                          )}
                        </p>
                        <p className="tabular m-0 text-xs text-[var(--sea-ink-faint)]">
                          {formatDateTime(h.at)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          </div>
        </div>
      </section>
    </div>
  )
}

function NotesEditor({
  id,
  label,
  hint,
  value,
  onSave,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onSave: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(false)
  useEffect(() => setDraft(value), [value])
  const dirty = draft !== value
  return (
    <section>
      <label
        htmlFor={id}
        className="island-kicker mb-2 flex items-center gap-1.5"
      >
        <NoteIcon className="h-3 w-3" />
        {label}
      </label>
      <textarea
        id={id}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setSaved(false)
        }}
        rows={4}
        placeholder={hint}
        className="field w-full resize-y text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty}
          onClick={() => {
            onSave(draft)
            setSaved(true)
          }}
          className="btn btn-primary btn-sm"
        >
          Enregistrer
        </button>
        {saved && !dirty && (
          <span className="text-xs text-[var(--status-good)]">Enregistré</span>
        )}
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
