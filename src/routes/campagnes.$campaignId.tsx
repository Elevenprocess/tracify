import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import AppShell from '../components/AppShell'
import CampaignOverview, { STATUS_LABELS } from '../components/CampaignOverview'
import ProspectsBoard from '../components/ProspectsBoard'
import { ArrowLeftIcon } from '../components/icons'
import RequireAuth from '../components/RequireAuth'

export const Route = createFileRoute('/campagnes/$campaignId')({
  component: CampaignPage,
})

function CampaignPage() {
  return (
    <RequireAuth>
      <AppShell>
        <CampaignDetail />
      </AppShell>
    </RequireAuth>
  )
}

function CampaignDetail() {
  const { campaignId } = Route.useParams()
  const data = useQuery(api.meta.campaignDetail, { metaId: campaignId })

  if (data === undefined) {
    return <p className="demo-muted m-0 text-sm">Chargement des données…</p>
  }

  if (data === null) {
    return (
      <main className="py-16 text-center">
        <h1 className="text-2xl font-bold text-[var(--sea-ink)]">
          Campagne introuvable
        </h1>
        <Link to="/dashboard" className="mt-4 inline-block">
          Retour au tableau de bord
        </Link>
      </main>
    )
  }

  const status = data.status ? STATUS_LABELS[data.status] : undefined

  return (
    <main className="min-w-0">
      <header className="rise-in mb-6">
        <nav aria-label="Fil d'Ariane" className="mb-2 text-sm">
          {data.client ? (
            <Link
              to="/clients/$clientId"
              params={{ clientId: data.client.slug }}
              className="inline-flex items-center gap-1.5 no-underline text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              {data.client.name}
            </Link>
          ) : (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 no-underline text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Tableau de bord
            </Link>
          )}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-2xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-3xl">
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
          Campagne Meta {data.metaId} · 30 derniers jours
          {data.lastSyncedAt &&
            ` · synchronisée ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(data.lastSyncedAt))}`}
        </p>
        {data.syncError && (
          <p className="m-0 mt-2 text-sm text-[var(--status-warn)]">
            Erreur de sync : {data.syncError}
          </p>
        )}
      </header>

      <CampaignOverview data={data} />

      <ProspectsBoard campaignId={data.metaId} />
    </main>
  )
}
