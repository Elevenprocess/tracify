import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { BriefcaseIcon, GridIcon, PlusIcon } from './icons'

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-wrap px-4 pb-10 pt-8 lg:flex lg:items-start lg:gap-8">
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Sidebar() {
  const clients = useQuery(api.clients.list)
  const createClient = useMutation(api.clients.create)
  const navigate = useNavigate()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [sector, setSector] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const { slug } = await createClient({
        name,
        sector: sector || undefined,
      })
      setName('')
      setSector('')
      setShowForm(false)
      navigate({ to: '/clients/$clientId', params: { clientId: slug } })
    } catch (err) {
      setError(String(err).replace(/^.*Error: /, ''))
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="mb-8 w-full flex-shrink-0 lg:sticky lg:top-24 lg:mb-0 lg:w-56">
      <nav aria-label="Navigation principale">
        <p className="island-kicker m-0 mb-2">Plateforme</p>
        <Link
          to="/dashboard"
          className="mb-6 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] no-underline hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
          activeProps={{
            className:
              'mb-6 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold no-underline bg-[var(--surface-strong)] text-[var(--sea-ink)]',
          }}
        >
          <GridIcon />
          Vue d'ensemble
        </Link>

        <p className="island-kicker m-0 mb-2">Mes clients</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {(clients ?? []).map((c) => (
            <li key={c.slug}>
              <Link
                to="/clients/$clientId"
                params={{ clientId: c.slug }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] no-underline hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
                activeProps={{
                  className:
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold no-underline bg-[var(--surface-strong)] text-[var(--sea-ink)]',
                }}
              >
                <BriefcaseIcon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{c.name}</span>
              </Link>
            </li>
          ))}
          {clients !== undefined && clients.length === 0 && (
            <li className="px-3 py-2 text-sm text-[var(--sea-ink-soft)]">
              Aucun client pour l'instant.
            </li>
          )}
        </ul>

        {showForm ? (
          <form
            onSubmit={onSubmit}
            className="island-shell mt-3 flex flex-col gap-2 rounded-xl p-3"
          >
            <label className="text-xs font-semibold text-[var(--sea-ink-soft)]">
              Nom du client
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                placeholder="Ex. Solaire Plus"
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--sea-ink-soft)]">
              Secteur (optionnel)
              <input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Ex. Photovoltaïque"
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
              />
            </label>
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
            className="mt-3 flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-[var(--line)] bg-transparent px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] hover:border-[var(--lagoon)] hover:text-[var(--sea-ink)]"
          >
            <PlusIcon />
            Nouveau client
          </button>
        )}
      </nav>
    </aside>
  )
}
