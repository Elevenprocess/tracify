import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import CampaignOverview, { STATUS_LABELS } from '../components/CampaignOverview'
import { TRACKING_CODE_KEY } from '../lib/trackingCode'

export const Route = createFileRoute('/suivi')({
  component: SuiviPage,
})

// Suivi client d'une campagne : accès par code (page de connexion), sans
// compte ni sidebar — même présentation que la vue admin, en lecture seule.
function SuiviPage() {
  const navigate = useNavigate()
  // undefined = pas encore lu (SSR/hydratation), null = aucun code mémorisé
  const [code, setCode] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    setCode(localStorage.getItem(TRACKING_CODE_KEY))
  }, [])

  useEffect(() => {
    if (code === null) navigate({ to: '/login' })
  }, [code, navigate])

  const data = useQuery(api.access.trackingView, code ? { code } : 'skip')

  const quit = () => {
    localStorage.removeItem(TRACKING_CODE_KEY)
    navigate({ to: '/login' })
  }

  if (!code || data === undefined) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
        <p className="demo-muted m-0 text-sm">Chargement du suivi…</p>
      </main>
    )
  }

  if (data === null) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-16 text-center sm:px-8">
        <h1 className="m-0 text-2xl font-bold text-[var(--sea-ink)]">
          Ce code n'est plus valide
        </h1>
        <p className="m-0 mt-2 text-sm text-[var(--sea-ink-soft)]">
          Il a peut-être été régénéré. Demandez le nouveau code à votre contact
          Eleven Process.
        </p>
        <button
          type="button"
          onClick={quit}
          className="mt-6 cursor-pointer rounded-xl bg-[var(--lagoon)] px-4 py-2.5 text-sm font-bold text-white"
        >
          Saisir un autre code
        </button>
      </main>
    )
  }

  const status = data.status ? STATUS_LABELS[data.status] : undefined

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8 sm:px-8">
      <header className="rise-in mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="island-kicker m-0 mb-1">
              Suivi de votre publicité
              {data.client ? ` · ${data.client.name}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-2xl">
                {data.name}
              </h1>
              {status && (
                <span className="demo-pill whitespace-nowrap">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: status.color }}
                    aria-hidden="true"
                  />
                  {status.label}
                </span>
              )}
            </div>
            <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
              30 derniers jours
              {data.lastSyncedAt &&
                ` · mis à jour ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(data.lastSyncedAt))}`}
            </p>
          </div>
          <button
            type="button"
            onClick={quit}
            className="cursor-pointer rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
          >
            Quitter
          </button>
        </div>
      </header>

      <CampaignOverview data={data} compact />
    </main>
  )
}
