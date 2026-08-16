import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import KpiCard from '../components/KpiCard'
import LineChart from '../components/charts/LineChart'
import { CampaignBadge } from '../components/StatusBadge'
import AppShell from '../components/AppShell'
import {
  BriefcaseIcon,
  ChevronRightIcon,
  TargetIcon,
  UsersIcon,
  WalletIcon,
} from '../components/icons'
import { formatDay, formatEuro, formatNumber } from '../lib/format'
import RequireAuth from '../components/RequireAuth'
import {
  EmptyState,
  PageHeader,
  PageSkeleton,
  SectionTitle,
} from '../components/ui'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <RequireAuth>
      <AppShell>
        <Dashboard />
      </AppShell>
    </RequireAuth>
  )
}

function Dashboard() {
  const data = useQuery(api.dashboard.overview)

  if (!data) return <PageSkeleton />

  const { totals } = data

  const spendSeries = data.daily.map((d) => ({
    label: formatDay(d.date),
    value: d.spend,
  }))
  const leadSeries = data.daily.map((d) => ({
    label: formatDay(d.date),
    value: d.leads,
  }))

  return (
    <main className="min-w-0">
      <PageHeader
        kicker="Vue d'ensemble"
        title="Suivi des campagnes clients"
        meta={`30 derniers jours · ${formatNumber(data.clients.length)} ${data.clients.length > 1 ? 'comptes suivis' : 'compte suivi'}`}
      />

      <section
        aria-label="Indicateurs clés"
        className="rise-in grid gap-4 sm:grid-cols-3"
      >
        <KpiCard
          label="Dépense publicitaire"
          value={formatEuro(totals.spend)}
          icon={<WalletIcon />}
          delta={totals.spendDelta ?? undefined}
          deltaLabel="vs 30 j précédents"
        />
        <KpiCard
          label="Prospects"
          value={formatNumber(totals.leads)}
          icon={<UsersIcon />}
          delta={totals.leadsDelta ?? undefined}
          deltaLabel="vs 30 j précédents"
        />
        <KpiCard
          label="Coût par prospect"
          value={totals.cpl !== null ? formatEuro(totals.cpl) : '—'}
          icon={<TargetIcon />}
          delta={totals.cplDelta ?? undefined}
          deltaLabel="vs 30 j précédents"
          deltaGoodWhenDown
        />
      </section>

      {data.daily.length > 1 && (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className="island-shell rise-in rounded-2xl p-5">
            <h2 className="demo-section-title mb-4">Dépense quotidienne</h2>
            <LineChart data={spendSeries} formatValue={formatEuro} />
          </article>
          <article className="island-shell rise-in rounded-2xl p-5">
            <h2 className="demo-section-title mb-4">Prospects par jour</h2>
            <LineChart
              data={leadSeries}
              color="var(--chart-2)"
              formatValue={formatNumber}
            />
          </article>
        </section>
      )}

      <section className="mt-6">
        <SectionTitle icon={<BriefcaseIcon className="h-4 w-4" />}>
          Projets & clients
        </SectionTitle>
        <div className="demo-table-shell island-shell rounded-2xl">
          {data.clients.length > 0 ? (
            <table className="demo-table min-w-[680px] text-sm">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="num">Campagnes</th>
                  <th className="num">Dépense 30 j</th>
                  <th className="num">Prospects 30 j</th>
                  <th className="num">Coût / prospect</th>
                  <th>Statut</th>
                  <th aria-label="Ouvrir" />
                </tr>
              </thead>
              <tbody>
                {data.clients.map((c) => (
                  <tr key={c.slug} className="group">
                    <td>
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: c.slug }}
                        className="flex items-center gap-3 font-semibold text-[var(--sea-ink)] no-underline hover:text-[var(--lagoon)]"
                      >
                        <span className="icon-chip h-8 w-8 rounded-lg text-xs font-extrabold uppercase">
                          {c.name.slice(0, 2)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate">{c.name}</span>
                          {c.sector && (
                            <span className="block text-xs font-normal text-[var(--sea-ink-faint)]">
                              {c.sector}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="num">{formatNumber(c.activeCampaigns)}</td>
                    <td className="num">{formatEuro(c.spend30d)}</td>
                    <td className="num">{formatNumber(c.leads30d)}</td>
                    <td className="num">
                      {c.cpl !== null ? formatEuro(c.cpl) : '—'}
                    </td>
                    <td>
                      <CampaignBadge status={c.status} />
                    </td>
                    <td className="w-8 pr-3 text-[var(--sea-ink-faint)] group-hover:text-[var(--lagoon)]">
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: c.slug }}
                        aria-label={`Ouvrir ${c.name}`}
                        className="text-inherit"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              icon={<BriefcaseIcon className="h-4 w-4" />}
              title="Aucun projet ni client pour l'instant"
              hint="Crée un projet ou un client depuis la barre latérale : ses campagnes Meta actives seront rattachées automatiquement."
            />
          )}
        </div>
      </section>
    </main>
  )
}
