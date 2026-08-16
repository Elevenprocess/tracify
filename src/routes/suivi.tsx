import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import CampaignOverview, { STATUS_LABELS } from '../components/CampaignOverview'
import { PipelineBoard } from '../components/ProspectsBoard'
import { TRACKING_CODE_KEY } from '../lib/trackingCode'

export const Route = createFileRoute('/suivi')({
  component: SuiviPage,
})

// Suivi client : accès par code (page de connexion), sans compte ni sidebar —
// les campagnes du client avec la présentation de la vue admin, en lecture
// seule. Un sélecteur bascule entre campagnes s'il y en a plusieurs.
function SuiviPage() {
  const navigate = useNavigate()
  // undefined = pas encore lu (SSR/hydratation), null = aucun code mémorisé
  const [code, setCode] = useState<string | null | undefined>(undefined)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    setCode(localStorage.getItem(TRACKING_CODE_KEY))
  }, [])

  useEffect(() => {
    if (code === null) navigate({ to: '/login' })
  }, [code, navigate])

  const data = useQuery(api.access.trackingView, code ? { code } : 'skip')
  const prospects = useQuery(
    api.access.trackingProspects,
    code ? { code } : 'skip',
  )
  const setProspectStatus = useMutation(api.access.trackingSetStatus)

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

  const campaign =
    data.campaigns.find((c) => c.metaId === selected) ?? data.campaigns.at(0)
  const status = campaign?.status ? STATUS_LABELS[campaign.status] : undefined

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8 sm:px-8">
      <header className="rise-in mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="island-kicker m-0 mb-1">
              Suivi de vos publicités · {data.client.name}
            </p>
            {campaign && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="m-0 text-xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-2xl">
                    {campaign.name}
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
                  {campaign.lastSyncedAt &&
                    ` · mis à jour ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(campaign.lastSyncedAt))}`}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={quit}
            className="cursor-pointer rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
          >
            Quitter
          </button>
        </div>

        {data.campaigns.length > 1 && (
          <nav
            aria-label="Choix de la campagne"
            className="mt-4 flex flex-wrap gap-2"
          >
            {data.campaigns.map((c) => {
              const active = c.metaId === campaign?.metaId
              return (
                <button
                  key={c.metaId}
                  type="button"
                  onClick={() => setSelected(c.metaId)}
                  className={`cursor-pointer rounded-xl border px-3 py-1.5 text-sm font-semibold ${
                    active
                      ? 'border-[var(--lagoon)] bg-[var(--lagoon)] text-white'
                      : 'border-[var(--line)] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
                  }`}
                >
                  {c.name}
                </button>
              )
            })}
          </nav>
        )}
      </header>

      {campaign ? (
        <CampaignOverview data={campaign} compact />
      ) : (
        <p className="demo-muted m-0 text-sm">
          Aucune campagne rattachée pour l'instant — revenez bientôt.
        </p>
      )}

      <PipelineBoard
        title="Vos prospects"
        prospects={prospects ?? []}
        onSetStatus={(id, next) => {
          if (code) setProspectStatus({ code, id, status: next })
        }}
        emptyHint="Aucun prospect pour l'instant"
      />
    </main>
  )
}
