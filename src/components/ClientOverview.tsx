import KpiCard from './KpiCard'
import LineChart from './charts/LineChart'
import { COLUMNS } from './ProspectsBoard'
import type { Prospect } from './ProspectsBoard'
import type { CampaignDetailData } from './CampaignOverview'
import { STATUS_LABELS } from './CampaignOverview'
import {
  ChevronRightIcon,
  InboxIcon,
  MegaphoneIcon,
  SparkleIcon,
  TargetIcon,
  UsersIcon,
  WalletIcon,
} from './icons'
import { EmptyState, SectionTitle } from './ui'
import { formatDay, formatEuro, formatNumber, isRecent } from '../lib/format'

// Vue d'ensemble de l'espace client : totaux de toutes les campagnes,
// courbes cumulées, état du pipeline et une carte par campagne.
export default function ClientOverview({
  campaigns,
  prospects,
  onSelectCampaign,
}: {
  campaigns: Array<CampaignDetailData>
  prospects: Array<Prospect>
  onSelectCampaign: (metaId: string, tab?: 'performance' | 'prospects') => void
}) {
  const spend = campaigns.reduce((s, c) => s + c.totals.spend, 0)
  const leads = campaigns.reduce((s, c) => s + c.totals.leads, 0)
  const cpl = leads > 0 ? spend / leads : null

  const byDate = new Map<string, { spend: number; leads: number }>()
  for (const c of campaigns)
    for (const d of c.daily) {
      const agg = byDate.get(d.date) ?? { spend: 0, leads: 0 }
      agg.spend += d.spend
      agg.leads += d.leads
      byDate.set(d.date, agg)
    }
  const daily = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
  const spendSeries = daily.map(([date, d]) => ({
    label: formatDay(date),
    value: d.spend,
  }))
  const leadSeries = daily.map(([date, d]) => ({
    label: formatDay(date),
    value: d.leads,
  }))

  const pipeline = { new: 0, contacted: 0, qualified: 0, lost: 0 }
  for (const p of prospects) pipeline[p.status] += 1
  const fresh = prospects.filter(
    (p) => p.status === 'new' && p.createdAt && isRecent(p.createdAt),
  ).length
  const prospectsByCampaign = new Map<string, number>()
  for (const p of prospects)
    if (p.campaignId)
      prospectsByCampaign.set(
        p.campaignId,
        (prospectsByCampaign.get(p.campaignId) ?? 0) + 1,
      )

  return (
    <>
      <section
        aria-label="Indicateurs clés"
        className="rise-in grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <KpiCard
          label="Dépense publicitaire"
          value={formatEuro(spend)}
          icon={<WalletIcon />}
          compact
          hint="30 derniers jours"
        />
        <KpiCard
          label="Prospects générés"
          value={formatNumber(leads)}
          icon={<UsersIcon />}
          compact
          hint="Toutes campagnes"
        />
        <KpiCard
          label="Coût par prospect"
          value={cpl !== null ? formatEuro(cpl) : '—'}
          icon={<TargetIcon />}
          compact
        />
        <KpiCard
          label="À traiter"
          value={formatNumber(pipeline.new)}
          icon={<InboxIcon />}
          compact
          hint={
            fresh > 0
              ? `${fresh} ${fresh > 1 ? 'arrivés' : 'arrivé'} ces 24 h`
              : 'Aucun nouveau ces 24 h'
          }
        />
      </section>

      {daily.length > 1 && (
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

      {/* Pipeline */}
      <section className="mt-6">
        <SectionTitle icon={<UsersIcon className="h-4 w-4" />}>
          Vos prospects
          <span className="tabular font-semibold text-[var(--sea-ink-faint)]">
            {prospects.length}
          </span>
        </SectionTitle>
        <article className="island-shell rise-in rounded-2xl p-5">
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]"
            role="img"
            aria-label="Répartition des prospects par statut"
          >
            {prospects.length > 0 &&
              COLUMNS.map((c) => {
                const n = pipeline[c.status]
                if (!n) return null
                return (
                  <span
                    key={c.status}
                    style={{
                      width: `${(n / prospects.length) * 100}%`,
                      background: c.color,
                    }}
                    title={`${c.label} : ${n}`}
                  />
                )
              })}
          </div>
          <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
            {COLUMNS.map((c) => (
              <li
                key={c.status}
                className="rounded-xl border border-[var(--line)] px-3 py-2.5"
              >
                <p className="m-0 flex items-center gap-1.5 text-[11px] font-bold text-[var(--sea-ink-soft)]">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: c.color }}
                    aria-hidden="true"
                  />
                  {c.label}
                </p>
                <p className="tabular m-0 mt-1 text-xl font-extrabold text-[var(--sea-ink)]">
                  {formatNumber(pipeline[c.status])}
                </p>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-3 text-xs text-[var(--sea-ink-soft)]">
            Ouvrez une campagne, onglet « Prospects », pour traiter la liste en
            kanban et consulter le dossier de chacun.
          </p>
        </article>
      </section>

      {/* Campagnes */}
      <section className="mt-6">
        <SectionTitle icon={<MegaphoneIcon className="h-4 w-4" />}>
          Vos campagnes
          <span className="tabular font-semibold text-[var(--sea-ink-faint)]">
            {campaigns.length}
          </span>
        </SectionTitle>
        {campaigns.length > 0 ? (
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {campaigns.map((c) => {
              const status = c.status ? STATUS_LABELS[c.status] : undefined
              const nProspects = prospectsByCampaign.get(c.metaId) ?? 0
              return (
                <li key={c.metaId}>
                  <article className="island-shell rise-in flex h-full flex-col rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="m-0 truncate text-sm font-bold text-[var(--sea-ink)]">
                          {c.name}
                        </h3>
                        <p className="m-0 mt-0.5 text-xs text-[var(--sea-ink-soft)]">
                          {c.creatives.length} créative
                          {c.creatives.length > 1 ? 's' : ''} · 30 derniers
                          jours
                        </p>
                      </div>
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
                    <dl className="m-0 mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border border-[var(--line)] px-2 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--sea-ink-faint)]">
                          Dépense
                        </dt>
                        <dd className="tabular m-0 mt-0.5 text-base font-extrabold text-[var(--sea-ink)]">
                          {formatEuro(c.totals.spend)}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-[var(--line)] px-2 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--sea-ink-faint)]">
                          Prospects
                        </dt>
                        <dd className="tabular m-0 mt-0.5 text-base font-extrabold text-[var(--sea-ink)]">
                          {formatNumber(c.totals.leads)}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-[var(--line)] px-2 py-2">
                        <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--sea-ink-faint)]">
                          Coût / prospect
                        </dt>
                        <dd className="tabular m-0 mt-0.5 text-base font-extrabold text-[var(--sea-ink)]">
                          {c.totals.cpl !== null
                            ? formatEuro(c.totals.cpl)
                            : '—'}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectCampaign(c.metaId, 'performance')
                        }
                        className="btn btn-secondary btn-sm"
                      >
                        Performance & créatives
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectCampaign(c.metaId, 'prospects')}
                        className="btn btn-ghost btn-sm"
                      >
                        <UsersIcon className="h-3.5 w-3.5" />
                        Prospects
                        <span className="tabular rounded-md bg-[var(--surface-strong)] px-1.5 py-0.5 text-[11px] font-bold">
                          {nProspects}
                        </span>
                      </button>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="island-shell rounded-2xl">
            <EmptyState
              icon={<MegaphoneIcon className="h-4 w-4" />}
              title="Aucune campagne rattachée pour l'instant"
              hint="Vos campagnes apparaîtront ici dès leur lancement — revenez bientôt."
            />
          </div>
        )}
      </section>

      {fresh > 0 && (
        <p className="m-0 mt-6 flex items-center gap-2 text-xs text-[var(--sea-ink-soft)]">
          <SparkleIcon className="h-3.5 w-3.5 text-[var(--lagoon)]" />
          {fresh} nouveau{fresh > 1 ? 'x' : ''} prospect{fresh > 1 ? 's' : ''}{' '}
          {fresh > 1 ? 'sont arrivés' : 'est arrivé'} ces dernières 24 h.
        </p>
      )}
    </>
  )
}
