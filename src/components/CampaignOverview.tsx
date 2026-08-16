import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../convex/_generated/api'
import KpiCard from './KpiCard'
import LineChart from './charts/LineChart'
import {
  EyeIcon,
  MegaphoneIcon,
  MousePointerIcon,
  TargetIcon,
  TrendIcon,
  UsersIcon,
  WalletIcon,
} from './icons'
import { EmptyState, SectionTitle } from './ui'
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
          icon={<EyeIcon />}
          compact={compact}
        />
        <KpiCard
          label="Clics"
          value={formatNumber(data.totals.clicks)}
          icon={<MousePointerIcon />}
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
        <SectionTitle
          icon={<MegaphoneIcon className="h-4 w-4" />}
          aside={
            data.creatives.length > 0 && (
              <span className="text-xs text-[var(--sea-ink-faint)]">
                {formatNumber(data.creatives.length)} créative
                {data.creatives.length > 1 ? 's' : ''} · triées par dépense
              </span>
            )
          }
        >
          Créatives
        </SectionTitle>
        <div className="demo-table-shell island-shell rounded-2xl">
          {data.creatives.length > 0 ? (
            <table className="demo-table min-w-[860px] text-sm">
              <thead>
                <tr>
                  <th>Créative</th>
                  <th className="num">Dépense</th>
                  <th className="num">Impressions</th>
                  <th className="num">Clics</th>
                  <th className="num">CTR</th>
                  <th className="num">CPC</th>
                  <th className="num">Prospects</th>
                  <th className="num">Coût / prospect</th>
                </tr>
              </thead>
              <tbody>
                {data.creatives.map((c, i) => {
                  const adStatus = c.status
                    ? STATUS_LABELS[c.status]
                    : undefined
                  const best = i === 0 && c.leads > 0
                  return (
                    <tr key={c.adId}>
                      <td>
                        <div className="flex items-center gap-3">
                          {c.thumbnailUrl ? (
                            <img
                              src={c.thumbnailUrl}
                              alt=""
                              loading="lazy"
                              className="h-11 w-11 flex-shrink-0 rounded-lg border border-[var(--line)] object-cover"
                            />
                          ) : (
                            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--sea-ink-soft)]">
                              <MegaphoneIcon className="h-4 w-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="m-0 max-w-72 truncate font-semibold text-[var(--sea-ink)]">
                              {c.name}
                            </p>
                            <p className="m-0 mt-0.5 flex items-center gap-1.5 text-xs text-[var(--sea-ink-soft)]">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  background:
                                    adStatus?.color ?? 'var(--status-muted)',
                                }}
                                aria-hidden="true"
                              />
                              {adStatus?.label ?? c.status ?? '—'}
                              {best && (
                                <span className="ml-1 rounded-md bg-[var(--lagoon-tint)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--lagoon)]">
                                  Top
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="num font-semibold">
                        {formatEuro(c.spend)}
                      </td>
                      <td className="num">{formatNumber(c.impressions)}</td>
                      <td className="num">{formatNumber(c.clicks)}</td>
                      <td className="num">
                        {c.ctr !== null ? formatPercent(c.ctr) : '—'}
                      </td>
                      <td className="num">
                        {c.cpc !== null ? formatEuro(c.cpc) : '—'}
                      </td>
                      <td className="num font-semibold">
                        {formatNumber(c.leads)}
                      </td>
                      <td className="num">
                        {c.cpl !== null ? formatEuro(c.cpl) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState
              icon={<MegaphoneIcon className="h-4 w-4" />}
              title="Aucune créative synchronisée pour l'instant"
              hint="La prochaine synchronisation (toutes les 6 h) les fera apparaître avec leurs miniatures."
            />
          )}
        </div>
      </section>
    </>
  )
}
