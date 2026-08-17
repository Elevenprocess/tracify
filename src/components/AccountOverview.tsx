import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { COLUMNS } from './ProspectsBoard'
import {
  CheckIcon,
  ClockIcon,
  GridIcon,
  KeyIcon,
  MegaphoneIcon,
  SparkleIcon,
  UsersIcon,
  WebhookIcon,
} from './icons'
import { SectionTitle } from './ui'
import { formatAgo, formatNumber, formatPercent } from '../lib/format'

export interface AccountData {
  pipeline: { new: number; contacted: number; qualified: number; lost: number }
  totalLeads: number
  newLeads24h: number
  qualificationRate: number | null
  viaWebhook: number
  lastLeadAt: string | null
  lastSyncAt: string | null
  hasAccessCode: boolean
  hasWebhook: boolean
  ghl: {
    locationId: string
    lastSyncAt: string | null
    error: string | null
  } | null
  fromGhl: number
  campaigns: Array<{
    metaId: string
    name: string
    status: string | null
    leads: number
  }>
  unassignedLeads: number
}

// Tableau de bord du compte client : où en est le pipeline, comment arrivent
// les leads, ce que le client peut voir. Vue de synthèse en tête de fiche.
export default function AccountOverview({
  account,
  activeCampaigns,
}: {
  account: AccountData
  activeCampaigns: number
}) {
  const { pipeline } = account
  const total = account.totalLeads
  const treated = pipeline.contacted + pipeline.qualified + pipeline.lost

  return (
    <section className="mb-6">
      <SectionTitle icon={<GridIcon className="h-4 w-4" />}>
        Tableau de bord du compte
      </SectionTitle>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* Pipeline */}
        <article className="island-shell rise-in rounded-2xl p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="m-0 flex items-center gap-2 text-sm font-bold text-[var(--sea-ink)]">
                <UsersIcon className="h-4 w-4 text-[var(--lagoon)]" />
                Pipeline prospects
              </h3>
              <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">
                {total > 0
                  ? `${formatNumber(total)} prospect${total > 1 ? 's' : ''} au total · ${formatNumber(treated)} traité${treated > 1 ? 's' : ''}`
                  : 'Aucun prospect reçu pour l’instant'}
              </p>
            </div>
            {account.newLeads24h > 0 && (
              <span className="demo-pill whitespace-nowrap">
                <SparkleIcon className="h-3 w-3 text-[var(--lagoon)]" />
                {account.newLeads24h} nouveau
                {account.newLeads24h > 1 ? 'x' : ''} (24 h)
              </span>
            )}
          </div>

          {/* Barre de répartition */}
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]"
            role="img"
            aria-label="Répartition des prospects par statut"
          >
            {total > 0 &&
              COLUMNS.map((c) => {
                const n = pipeline[c.status]
                if (!n) return null
                return (
                  <span
                    key={c.status}
                    style={{
                      width: `${(n / total) * 100}%`,
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

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--sea-ink-soft)]">
            <span>
              Taux de qualification :{' '}
              <strong className="text-[var(--sea-ink)]">
                {account.qualificationRate !== null
                  ? formatPercent(Math.round(account.qualificationRate))
                  : '—'}
              </strong>
            </span>
            <span>
              Reçus automatiquement :{' '}
              <strong className="text-[var(--sea-ink)]">
                {formatNumber(account.viaWebhook)}
              </strong>
            </span>
            {account.unassignedLeads > 0 && (
              <span>
                Sans campagne :{' '}
                <strong className="text-[var(--sea-ink)]">
                  {formatNumber(account.unassignedLeads)}
                </strong>
              </span>
            )}
          </div>
        </article>

        {/* État du compte */}
        <article className="island-shell rise-in rounded-2xl p-5">
          <h3 className="m-0 mb-3 text-sm font-bold text-[var(--sea-ink)]">
            État du compte
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            <StatusRow
              icon={<MegaphoneIcon className="h-3.5 w-3.5" />}
              label="Campagnes actives"
              ok={activeCampaigns > 0}
              value={
                activeCampaigns > 0
                  ? `${formatNumber(activeCampaigns)} en cours`
                  : 'Aucune'
              }
              hint={
                account.lastSyncAt
                  ? `Dernière synchro ${formatAgo(account.lastSyncAt)}`
                  : 'Pas encore synchronisé'
              }
            />
            <StatusRow
              icon={<WebhookIcon className="h-3.5 w-3.5" />}
              label="Réception des leads"
              ok={account.hasWebhook || Boolean(account.ghl)}
              value={
                account.ghl && !account.ghl.error
                  ? account.hasWebhook
                    ? 'GHL + webhook'
                    : 'Synchro GHL active'
                  : account.ghl?.error
                    ? 'Synchro GHL en erreur'
                    : account.hasWebhook
                      ? 'Webhook actif'
                      : 'Non activé'
              }
              hint={
                account.lastLeadAt
                  ? `Dernier prospect ${formatAgo(account.lastLeadAt)}`
                  : 'Aucun prospect reçu'
              }
            />
            <StatusRow
              icon={<KeyIcon className="h-3.5 w-3.5" />}
              label="Espace client"
              ok={account.hasAccessCode}
              value={account.hasAccessCode ? 'Code actif' : 'Pas de code'}
              hint={
                account.hasAccessCode
                  ? 'Le client peut consulter son suivi'
                  : 'Génère un code plus bas pour ouvrir l’accès'
              }
            />
          </ul>

          {account.campaigns.length > 0 && (
            <>
              <p className="island-kicker m-0 mb-1.5 mt-4">
                Prospects par campagne
              </p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {account.campaigns.slice(0, 5).map((c) => (
                  <li key={c.metaId}>
                    <Link
                      to="/campagnes/$campaignId"
                      params={{ campaignId: c.metaId }}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs no-underline hover:bg-[var(--surface-strong)]"
                    >
                      <span
                        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                        style={{
                          background:
                            c.status === 'ACTIVE'
                              ? 'var(--status-good)'
                              : 'var(--status-muted)',
                        }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-[var(--sea-ink)]">
                        {c.name}
                      </span>
                      <span className="tabular font-bold text-[var(--sea-ink-soft)]">
                        {formatNumber(c.leads)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>
      </div>
    </section>
  )
}

function StatusRow({
  icon,
  label,
  ok,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  ok: boolean
  value: string
  hint?: string
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5">
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
        style={{
          background: ok ? 'rgba(88,193,132,0.12)' : 'rgba(138,165,161,0.12)',
          color: ok ? 'var(--status-good)' : 'var(--status-muted)',
        }}
      >
        {ok ? <CheckIcon className="h-3.5 w-3.5" /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-bold text-[var(--sea-ink)]">{label}</span>
          <span
            className="whitespace-nowrap font-semibold"
            style={{
              color: ok ? 'var(--status-good)' : 'var(--sea-ink-soft)',
            }}
          >
            {value}
          </span>
        </p>
        {hint && (
          <p className="m-0 mt-0.5 flex items-center gap-1 text-[11px] text-[var(--sea-ink-faint)]">
            <ClockIcon className="h-3 w-3" />
            {hint}
          </p>
        )}
      </div>
    </li>
  )
}
