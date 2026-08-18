import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import AppShell from '../components/AppShell'
import CampaignOverview, { STATUS_LABELS } from '../components/CampaignOverview'
import ProspectsBoard from '../components/ProspectsBoard'
import { AlertIcon, WebhookIcon } from '../components/icons'
import RequireAuth from '../components/RequireAuth'
import {
  EmptyState,
  PageHeader,
  PageSkeleton,
  SectionTitle,
} from '../components/ui'
import { GhlCard, WebhookCard } from '../components/AccessSection'

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

  if (data === undefined) return <PageSkeleton kpis={6} />

  if (data === null) {
    return (
      <main className="py-10">
        <EmptyState
          title="Campagne introuvable"
          hint="Elle a peut-être été détachée du client."
          action={
            <Link to="/dashboard" className="btn btn-secondary btn-sm">
              Retour au tableau de bord
            </Link>
          }
        />
      </main>
    )
  }

  const status = data.status ? STATUS_LABELS[data.status] : undefined

  return (
    <main className="min-w-0">
      <PageHeader
        back={
          data.client
            ? {
                to: '/clients/$clientId',
                params: { clientId: data.client.slug },
                label: data.client.name,
              }
            : { to: '/dashboard', label: 'Tableau de bord' }
        }
        kicker="Campagne Meta"
        title={data.name}
        badge={
          status && (
            <span className="demo-pill whitespace-nowrap">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: status.color }}
                aria-hidden="true"
              />
              {status.label}
            </span>
          )
        }
        meta={
          <>
            <span className="tabular">{data.metaId}</span> · 30 derniers jours
            {data.lastSyncedAt &&
              ` · synchronisée ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(data.lastSyncedAt))}`}
          </>
        }
      />
      {data.syncError && (
        <p className="m-0 mb-5 flex items-center gap-2 rounded-xl border border-[rgba(217,160,74,0.35)] bg-[rgba(217,160,74,0.08)] px-3.5 py-2.5 text-sm text-[var(--status-warn)]">
          <AlertIcon className="h-4 w-4 flex-shrink-0" />
          Erreur de sync : {data.syncError}
        </p>
      )}

      <CampaignOverview data={data} />

      <ProspectsBoard campaignId={data.metaId} />

      {data.client && (
        <section className="mt-8">
          <SectionTitle icon={<WebhookIcon className="h-4 w-4" />}>
            Réception des leads de cette campagne
          </SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            <WebhookCard
              clientSlug={data.client.slug}
              campaignId={data.metaId}
            />
            <GhlCard metaId={data.metaId} />
          </div>
        </section>
      )}
    </main>
  )
}
