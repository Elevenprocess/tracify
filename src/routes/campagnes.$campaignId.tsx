import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import AppShell from '../components/AppShell'
import KpiCard from '../components/KpiCard'
import LineChart from '../components/charts/LineChart'
import {
  ArrowLeftIcon,
  MegaphoneIcon,
  TargetIcon,
  TrendIcon,
  UsersIcon,
  WalletIcon,
} from '../components/icons'
import {
  formatDay,
  formatEuro,
  formatNumber,
  formatPercent,
} from '../lib/format'

export const Route = createFileRoute('/campagnes/$campaignId')({
  component: CampaignPage,
})

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'var(--status-good)' },
  PAUSED: { label: 'En pause', color: 'var(--status-warn)' },
}

function CampaignPage() {
  return (
    <AppShell>
      <CampaignDetail />
    </AppShell>
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

      <section
        aria-label="Indicateurs clés"
        className="rise-in grid gap-4 sm:grid-cols-3"
      >
        <KpiCard
          label="Dépense publicitaire"
          value={formatEuro(data.totals.spend)}
          icon={<WalletIcon />}
        />
        <KpiCard
          label="Prospects générés"
          value={formatNumber(data.totals.leads)}
          icon={<UsersIcon />}
        />
        <KpiCard
          label="Coût par prospect"
          value={data.totals.cpl !== null ? formatEuro(data.totals.cpl) : '—'}
          icon={<TargetIcon />}
        />
        <KpiCard
          label="Impressions"
          value={formatNumber(data.totals.impressions)}
          icon={<TrendIcon />}
        />
        <KpiCard
          label="Clics"
          value={formatNumber(data.totals.clicks)}
          icon={<TrendIcon />}
        />
        <KpiCard
          label="CTR · CPC"
          value={`${data.totals.ctr !== null ? formatPercent(data.totals.ctr) : '—'} · ${data.totals.cpc !== null ? formatEuro(data.totals.cpc) : '—'}`}
          icon={<TrendIcon />}
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
        <h2 className="demo-section-title mb-3 flex items-center gap-2">
          <MegaphoneIcon className="h-4 w-4 text-[var(--lagoon)]" />
          Créatives
        </h2>
        <div className="demo-table-shell island-shell rounded-2xl">
          <table className="demo-table min-w-[860px] text-sm">
            <thead>
              <tr>
                <th>Créative</th>
                <th>Dépense</th>
                <th>Impressions</th>
                <th>Clics</th>
                <th>CTR</th>
                <th>CPC</th>
                <th>Prospects</th>
                <th>Coût / prospect</th>
              </tr>
            </thead>
            <tbody>
              {data.creatives.map((c) => {
                const adStatus = c.status ? STATUS_LABELS[c.status] : undefined
                return (
                  <tr key={c.adId}>
                    <td>
                      <div className="flex items-center gap-3">
                        {c.thumbnailUrl ? (
                          <img
                            src={c.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            className="h-10 w-10 flex-shrink-0 rounded-lg border border-[var(--line)] object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--sea-ink-soft)]">
                            <MegaphoneIcon className="h-4 w-4" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="m-0 max-w-72 truncate font-semibold text-[var(--sea-ink)]">
                            {c.name}
                          </p>
                          <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
                            {adStatus?.label ?? c.status ?? '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>{formatEuro(c.spend)}</td>
                    <td>{formatNumber(c.impressions)}</td>
                    <td>{formatNumber(c.clicks)}</td>
                    <td>{c.ctr !== null ? formatPercent(c.ctr) : '—'}</td>
                    <td>{c.cpc !== null ? formatEuro(c.cpc) : '—'}</td>
                    <td>{formatNumber(c.leads)}</td>
                    <td>{c.cpl !== null ? formatEuro(c.cpl) : '—'}</td>
                  </tr>
                )
              })}
              {data.creatives.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center text-[var(--sea-ink-soft)]"
                  >
                    Aucune créative synchronisée pour l'instant — la prochaine
                    sync les fera apparaître.
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
