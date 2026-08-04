import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { BriefcaseIcon, FolderIcon, GridIcon, PlusIcon } from './icons'

type Kind = 'client' | 'project'

export interface SidebarEntry {
  slug: string
  name: string
  status: 'active' | 'paused' | 'ended'
  kind: Kind
}

// Sidebar dockée au bord de l'écran, contenu à droite avec sa propre largeur max.
export default function AppShell({
  children,
  sidebarInitial,
}: {
  children: ReactNode
  sidebarInitial?: Array<SidebarEntry>
}) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <Sidebar initial={sidebarInitial} />
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
          {children}
        </div>
      </div>
    </div>
  )
}

function Sidebar({ initial }: { initial?: Array<SidebarEntry> }) {
  const live = useQuery(api.clients.list)
  const entries = live ?? initial
  const projects = (entries ?? []).filter((e) => e.kind === 'project')
  const clients = (entries ?? []).filter((e) => e.kind !== 'project')

  return (
    <aside className="w-full flex-shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-6 lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <nav aria-label="Navigation principale" className="flex flex-col gap-6">
        <div>
          <p className="island-kicker m-0 mb-2">Plateforme</p>
          <SideLink to="/dashboard">
            <GridIcon />
            Vue d'ensemble
          </SideLink>
        </div>

        <SidebarGroup
          title="Mes projets"
          kind="project"
          icon={<FolderIcon className="h-4 w-4 flex-shrink-0" />}
          items={projects}
          loaded={entries !== undefined}
          emptyLabel="Aucun projet."
          addLabel="Nouveau projet"
        />

        <SidebarGroup
          title="Clients"
          kind="client"
          icon={<BriefcaseIcon className="h-4 w-4 flex-shrink-0" />}
          items={clients}
          loaded={entries !== undefined}
          emptyLabel="Aucun client."
          addLabel="Nouveau client"
        />
      </nav>
    </aside>
  )
}

function SideLink({
  to,
  params,
  children,
}: {
  to: string
  params?: Record<string, string>
  children: ReactNode
}) {
  const base =
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold no-underline'
  return (
    <Link
      to={to}
      params={params}
      className={`${base} text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]`}
      activeProps={{
        className: `${base} bg-[var(--surface-strong)] text-[var(--sea-ink)]`,
      }}
    >
      {children}
    </Link>
  )
}

function SidebarGroup({
  title,
  kind,
  icon,
  items,
  loaded,
  emptyLabel,
  addLabel,
}: {
  title: string
  kind: Kind
  icon: ReactNode
  items: Array<{ slug: string; name: string }>
  loaded: boolean
  emptyLabel: string
  addLabel: string
}) {
  const createEntry = useAction(api.clients.createChecked)
  const navigate = useNavigate()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [adAccountId, setAdAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const { slug } = await createEntry({ name, adAccountId, kind })
      setName('')
      setAdAccountId('')
      setShowForm(false)
      navigate({ to: '/clients/$clientId', params: { clientId: slug } })
    } catch (err) {
      const raw = String(err)
      const cleaned =
        raw.split('Uncaught Error: ').pop()?.split(' at handler')[0] ?? raw
      setError(cleaned.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="island-kicker m-0 mb-2">{title}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((c) => (
          <li key={c.slug}>
            <SideLink to="/clients/$clientId" params={{ clientId: c.slug }}>
              {icon}
              <span className="truncate">{c.name}</span>
            </SideLink>
          </li>
        ))}
        {loaded && items.length === 0 && (
          <li className="px-3 py-1.5 text-sm text-[var(--sea-ink-soft)]">
            {emptyLabel}
          </li>
        )}
      </ul>

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="mt-2 flex flex-col gap-2 rounded-xl border border-[var(--line)] p-3"
        >
          <label className="text-xs font-semibold text-[var(--sea-ink-soft)]">
            Nom
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder={
                kind === 'project' ? 'Ex. Hermes' : 'Ex. Solaire Plus'
              }
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--sea-ink-soft)]">
            ID du compte publicitaire
            <input
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              required
              placeholder="Ex. 928367685155102"
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
            />
          </label>
          <p className="m-0 text-[11px] leading-snug text-[var(--sea-ink-soft)]">
            Les campagnes actives du compte seront rattachées automatiquement.
          </p>
          {error && (
            <p className="m-0 text-xs text-[var(--status-warn)]">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 cursor-pointer rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-black disabled:opacity-50"
            >
              {saving ? 'Création…' : 'Créer'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="cursor-pointer rounded-lg border border-[var(--line)] bg-transparent px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink-soft)]"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-2 flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-[var(--line)] bg-transparent px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] hover:border-[var(--lagoon)] hover:text-[var(--sea-ink)]"
        >
          <PlusIcon />
          {addLabel}
        </button>
      )}
    </div>
  )
}
