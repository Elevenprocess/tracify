import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import KpiCard from '../components/KpiCard'
import BarChart from '../components/charts/BarChart'
import SourceSplit from '../components/charts/SourceSplit'
import { CampaignBadge } from '../components/StatusBadge'
import AppShell from '../components/AppShell'
import CampaignsPanel from '../components/CampaignsPanel'
import {
  EyeIcon,
  TargetIcon,
  TrashIcon,
  UsersIcon,
  WalletIcon,
} from '../components/icons'
import AccountOverview from '../components/AccountOverview'
import { EmptyState, PageHeader, PageSkeleton } from '../components/ui'
import { formatDayRange, formatEuro, formatNumber } from '../lib/format'
import RequireAuth from '../components/RequireAuth'
import AccessSection from '../components/AccessSection'
import { ClientProspectsBoard } from '../components/ProspectsBoard'

export const Route = createFileRoute('/clients/$clientId')({
  component: ClientDetailPage,
})

function ClientDetailPage() {
  return (
    <RequireAuth>
      <AppShell>
        <ClientDetail />
      </AppShell>
    </RequireAuth>
  )
}

function ClientDetail() {
  const { clientId } = Route.useParams()
  const client = useQuery(api.dashboard.client, { slug: clientId })
  const removeClient = useMutation(api.clients.remove)
  const navigate = useNavigate()

  if (client === undefined) return <PageSkeleton />

  if (client === null) {
    return (
      <main className="py-10">
        <EmptyState
          title="Client introuvable"
          hint="Il a peut-être été supprimé."
          action={
            <Link to="/dashboard" className="btn btn-secondary btn-sm">
              Retour au tableau de bord
            </Link>
          }
        />
      </main>
    )
  }

  const weekly = client.weeklyLeads.map((w) => ({
    label: formatDayRange(w.start, w.end),
    value: w.leads,
  }))

  return (
    <main className="min-w-0">
      <PageHeader
        back={{ to: '/dashboard', label: 'Tableau de bord' }}
        kicker="Fiche client"
        title={client.name}
        badge={<CampaignBadge status={client.status} />}
        meta={
          <>
            {client.sector ?? client.adAccountId ?? 'Compte non connecté'} ·{' '}
            {formatNumber(client.activeCampaigns)} campagne
            {client.activeCampaigns > 1 ? 's' : ''} active
            {client.activeCampaigns > 1 ? 's' : ''} · 30 derniers jours
          </>
        }
        actions={
          <>
            <Link
              to="/suivi"
              search={{ apercu: client.slug }}
              target="_blank"
              rel="noopener"
              className="btn btn-secondary btn-sm"
              title="Ouvre l'espace de suivi tel que le client le voit"
            >
              <EyeIcon className="h-3.5 w-3.5" />
              Voir comme le client
            </Link>
            <button
              type="button"
              aria-label={`Supprimer ${client.name}`}
              onClick={async () => {
                if (
                  window.confirm(
                    `Supprimer « ${client.name} » ? Ses campagnes, statistiques et créatives seront effacées de Tracify (rien n'est touché côté Meta).`,
                  )
                ) {
                  await removeClient({ slug: client.slug })
                  navigate({ to: '/dashboard' })
                }
              }}
              className="btn btn-danger btn-sm"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Supprimer
            </button>
          </>
        }
      />

      <AccountOverview
        account={client.account}
        activeCampaigns={client.activeCampaigns}
      />

      <section className="mb-6">
        <CampaignsPanel
          clientSlug={client.slug}
          adAccountId={client.adAccountId}
        />
      </section>

      <section
        aria-label="Indicateurs clés"
        className="rise-in grid gap-4 sm:grid-cols-3"
      >
        <KpiCard
          label="Dépense publicitaire"
          value={formatEuro(client.spend30d)}
          icon={<WalletIcon />}
        />
        <KpiCard
          label="Prospects"
          value={formatNumber(client.leads30d)}
          icon={<UsersIcon />}
        />
        <KpiCard
          label="Coût par prospect"
          value={client.cpl !== null ? formatEuro(client.cpl) : '—'}
          icon={<TargetIcon />}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <article className="island-shell rise-in rounded-2xl p-5">
          <h2 className="demo-section-title mb-4">Prospects par semaine</h2>
          {weekly.length > 0 ? (
            <BarChart data={weekly} formatValue={formatNumber} />
          ) : (
            <EmptyState
              compact
              title="Pas encore de données"
              hint="Les prospects apparaîtront après la première synchronisation Meta."
            />
          )}
        </article>
        <article className="island-shell rise-in rounded-2xl p-5">
          <h2 className="demo-section-title mb-4">Répartition par source</h2>
          {client.sources.length > 0 ? (
            <SourceSplit data={client.sources} />
          ) : (
            <EmptyState
              compact
              title="Aucune source"
              hint="La répartition se remplit avec les prospects reçus (webhook ou saisie manuelle)."
            />
          )}
        </article>
      </section>

      <ClientProspectsBoard clientSlug={client.slug} />

      <AccessSection
        clientSlug={client.slug}
        ghl={client.account.ghl}
        fromGhl={client.account.fromGhl}
      />
    </main>
  )
}
