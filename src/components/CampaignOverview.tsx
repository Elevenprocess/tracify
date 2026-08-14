import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../convex/_generated/api'
import KpiCard from './KpiCard'
import LineChart from './charts/LineChart'
import {
  MegaphoneIcon,
  TargetIcon,
  TrendIcon,
  UsersIcon,
  WalletIcon,
} from './icons'
import {
  formatDay,
  formatEuro,
  formatNumber,
  formatPercent,
} from '../lib/format'

export type CampaignDetailData = NonNullable<
  FunctionReturnType<typeof api.meta.campaignDetail>
>

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'var(--status-good)' },
  PAUSED: { label: 'En pause', color: 'var(--status-warn)' },
}

// Vue d'ensemble d'une campagne : KPIs, courbes quotidiennes et tableau des
// créatives. Partagée entre la page admin et la page de suivi client
// (`compact` resserre les KPIs pour cette dernière).
export default function CampaignOverview({
  data,
  compact = false,
}: {
  data: CampaignDetailData
  compact?: boolean
}) {
  const spendSeries = data.daily.map((d) => ({
    label: formatDay(d.date),
    value: d.spend,
  }))
  const leadSeries = data.daily.map((d) => ({
    label: formatDay(d.date),
    value: d.leads,
  }))

  return (
    <>
      <section
        aria-label="Indicateurs clés"
        className={`rise-in grid gap-4 ${compact ? 'grid-cols-2 gap-3 sm:grid-cols-3' : 'sm:grid-cols-3'}`}
      >
        <KpiCard
          label="Dépense publicitaire"
          value={formatEuro(data.totals.spend)}
          icon={<WalletIcon />}
          compact={compact}
        />
        <KpiCard
          label="Prospects générés"
          value={formatNumber(data.totals.leads)}
          icon={<UsersIcon />}
          compact={compact}
        />
        <KpiCard
          label="Coût par prospect"
          value={data.totals.cpl !== null ? formatEuro(data.totals.cpl) : '—'}
          icon={<TargetIcon />}
          compact={compact}
        />
        <KpiCard
          label="Impressions"
          value={formatNumber(data.totals.impressions)}
          icon={<TrendIcon />}
          compact={compact}
        />
        <KpiCard
          label="Clics"
          value={formatNumber(data.totals.clicks)}
          icon={<TrendIcon />}
          compact={compact}
        />
        <KpiCard
          label="CTR · CPC"
          value={`${data.totals.ctr !== null ? formatPercent(data.totals.ctr) : '—'} · ${data.totals.cpc !== null ? formatEuro(data.totals.cpc) : '—'}`}
          icon={<TrendIcon />}
          compact={compact}
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
    </>
  )
}
