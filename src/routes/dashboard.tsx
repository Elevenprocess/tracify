import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import KpiCard from '../components/KpiCard'
import LineChart from '../components/charts/LineChart'
import { CampaignBadge } from '../components/StatusBadge'
import AppShell from '../components/AppShell'
import { TargetIcon, UsersIcon, WalletIcon } from '../components/icons'
import { formatDay, formatEuro, formatNumber } from '../lib/format'

export const Route = createFileRoute('/dashboard')({ component: DashboardPage })

function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  )
}

function Dashboard() {
  const data = useQuery(api.dashboard.overview)

  if (!data) {
    return <p className="demo-muted m-0 text-sm">Chargement des données…</p>
  }

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
      <header className="rise-in mb-6">
        <p className="island-kicker m-0 mb-1">
          Vue d'ensemble · 30 derniers jours
        </p>
        <h1 className="m-0 text-2xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-3xl">
          Suivi des campagnes clients
        </h1>
      </header>

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
        <h2 className="demo-section-title mb-3">Clients</h2>
        <div className="demo-table-shell island-shell rounded-2xl">
          <table className="demo-table min-w-[640px] text-sm">
            <thead>
              <tr>
                <th>Client</th>
                <th>Campagnes actives</th>
                <th>Dépense 30 j</th>
                <th>Prospects 30 j</th>
                <th>Coût / prospect</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => (
                <tr key={c.slug}>
                  <td>
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: c.slug }}
                      className="font-semibold text-[var(--sea-ink)] no-underline hover:text-[var(--lagoon-deep)]"
                    >
                      {c.name}
                    </Link>
                    <span className="block text-xs text-[var(--sea-ink-soft)]">
                      {c.sector}
                    </span>
                  </td>
                  <td>{formatNumber(c.activeCampaigns)}</td>
                  <td>{formatEuro(c.spend30d)}</td>
                  <td>{formatNumber(c.leads30d)}</td>
                  <td>{c.cpl !== null ? formatEuro(c.cpl) : '—'}</td>
                  <td>
                    <CampaignBadge status={c.status} />
                  </td>
                </tr>
              ))}
              {data.clients.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-[var(--sea-ink-soft)]"
                  >
                    Aucun client — lancer le seed : npx convex run seed:run
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
