import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import KpiCard from '../components/KpiCard'
import BarChart from '../components/charts/BarChart'
import SourceSplit from '../components/charts/SourceSplit'
import { CampaignBadge, ProspectBadge } from '../components/StatusBadge'
import AppShell from '../components/AppShell'
import CampaignsPanel from '../components/CampaignsPanel'
import {
  ArrowLeftIcon,
  TargetIcon,
  TrashIcon,
  UsersIcon,
  WalletIcon,
} from '../components/icons'
import {
  formatDay,
  formatDayRange,
  formatEuro,
  formatNumber,
} from '../lib/format'
import { convexHttp } from '../lib/convexServer'

export const Route = createFileRoute('/clients/$clientId')({
  loader: async ({ params }) => ({
    initial: await convexHttp.query(api.dashboard.client, {
      slug: params.clientId,
    }),
  }),
  component: ClientDetailPage,
})

function ClientDetailPage() {
  return (
    <AppShell>
      <ClientDetail />
    </AppShell>
  )
}

function ClientDetail() {
  const { clientId } = Route.useParams()
  const { initial } = Route.useLoaderData()
  const live = useQuery(api.dashboard.client, { slug: clientId })
  const client = live === undefined ? initial : live
  const removeClient = useMutation(api.clients.remove)
  const navigate = useNavigate()

  if (client === undefined) {
    return <p className="demo-muted m-0 text-sm">Chargement des données…</p>
  }

  if (client === null) {
    return (
      <main className="py-16 text-center">
        <h1 className="text-2xl font-bold text-[var(--sea-ink)]">
          Client introuvable
        </h1>
        <Link to="/dashboard" className="mt-4 inline-block">
          Retour au tableau de bord
        </Link>
      </main>
    )
  }

  const weekly = client.weeklyLeads.map((w) => ({
    label: formatDayRange(w.start, w.end),
    value: w.leads,
  }))

  return (
    <main className="min-w-0">
      <header className="rise-in mb-6">
        <nav aria-label="Fil d'Ariane" className="mb-2 text-sm">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 no-underline text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Tableau de bord
          </Link>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-2xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-3xl">
            {client.name}
          </h1>
          <CampaignBadge status={client.status} />
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
            className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--line)] bg-transparent px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink-soft)] transition-colors hover:border-[var(--status-warn)] hover:text-[var(--status-warn)]"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Supprimer
          </button>
        </div>
        <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
          {client.sector ?? client.adAccountId ?? 'Compte non connecté'} ·{' '}
          {formatNumber(client.activeCampaigns)} campagne
          {client.activeCampaigns > 1 ? 's' : ''} active
          {client.activeCampaigns > 1 ? 's' : ''} · 30 derniers jours
        </p>
      </header>

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
            <p className="demo-muted m-0 text-sm">Aucune donnée.</p>
          )}
        </article>
        <article className="island-shell rise-in rounded-2xl p-5">
          <h2 className="demo-section-title mb-4">Répartition par source</h2>
          {client.sources.length > 0 ? (
            <SourceSplit data={client.sources} />
          ) : (
            <p className="demo-muted m-0 text-sm">Aucune donnée.</p>
          )}
        </article>
      </section>

      <section className="mt-6">
        <h2 className="demo-section-title mb-3">Derniers prospects</h2>
        <div className="demo-table-shell island-shell rounded-2xl">
          <table className="demo-table min-w-[640px] text-sm">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Date</th>
                <th>Source</th>
                <th>Support / contenu</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {client.prospects.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold">{p.name}</td>
                  <td className="whitespace-nowrap">{p.phone}</td>
                  <td className="whitespace-nowrap">{formatDay(p.date)}</td>
                  <td>{p.source}</td>
                  <td>{p.medium}</td>
                  <td>
                    <ProspectBadge status={p.status} />
                  </td>
                </tr>
              ))}
              {client.prospects.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-[var(--sea-ink-soft)]"
                  >
                    Aucun prospect sur la période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
