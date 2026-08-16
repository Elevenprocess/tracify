import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ChevronRightIcon, MegaphoneIcon } from './icons'
import { EmptyState } from './ui'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'var(--status-good)' },
  PAUSED: { label: 'En pause', color: 'var(--status-warn)' },
}

export interface CampaignItem {
  id: Id<'campaigns'>
  metaId: string
  name: string | null
  status: string | null
  lastSyncedAt: string | null
  syncError: string | null
}

export default function CampaignsPanel({
  clientSlug,
  adAccountId,
  initial,
}: {
  clientSlug: string
  adAccountId: string | null
  initial?: Array<CampaignItem>
}) {
  const live = useQuery(api.meta.campaignsByClient, { clientSlug })
  const campaigns = live ?? initial

  return (
    <article className="island-shell rise-in rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="demo-section-title m-0 flex items-center gap-2">
            <MegaphoneIcon className="h-4 w-4 text-[var(--lagoon)]" />
            Campagnes Meta
            {campaigns && campaigns.length > 0 && (
              <span className="tabular font-semibold text-[var(--sea-ink-faint)]">
                {campaigns.length}
              </span>
            )}
          </h2>
          {adAccountId && (
            <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">
              Compte publicitaire <span className="tabular">{adAccountId}</span>{' '}
              · les campagnes actives sont détectées et synchronisées
              automatiquement.
            </p>
          )}
        </div>
      </div>

      {!adAccountId && <AdAccountForm clientSlug={clientSlug} />}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(campaigns ?? []).map((c) => {
          const status = c.status ? STATUS_LABELS[c.status] : undefined
          return (
            <li key={c.id}>
              <Link
                to="/campagnes/$campaignId"
                params={{ campaignId: c.metaId }}
                className="group flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[rgba(255,255,255,0.015)] px-3.5 py-3 no-underline transition-colors hover:border-[var(--lagoon-line)] hover:bg-[var(--lagoon-tint)]"
              >
                <span className="icon-chip">
                  <MegaphoneIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-semibold text-[var(--sea-ink)]">
                    {c.name ?? `Campagne ${c.metaId}`}
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-[var(--sea-ink-soft)]">
                    <span className="tabular">{c.metaId}</span>
                    {c.lastSyncedAt
                      ? ` · synchronisée ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(c.lastSyncedAt))}`
                      : ' · synchronisation en cours…'}
                  </p>
                  {c.syncError && (
                    <p className="m-0 mt-1 text-xs text-[var(--status-warn)]">
                      Erreur de sync : {c.syncError}
                    </p>
                  )}
                </div>
                <span
                  className="demo-pill whitespace-nowrap"
                  style={status ? undefined : { color: 'var(--sea-ink-soft)' }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: status?.color ?? 'var(--status-muted)',
                    }}
                    aria-hidden="true"
                  />
                  {status?.label ?? (c.status || 'Inconnue')}
                </span>
                <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-[var(--sea-ink-faint)] transition-colors group-hover:text-[var(--lagoon)]" />
              </Link>
            </li>
          )
        })}
        {campaigns === undefined &&
          [0, 1].map((i) => (
            <li key={i} className="skeleton h-16 w-full rounded-xl" />
          ))}
        {campaigns !== undefined && campaigns.length === 0 && (
          <li className="rounded-xl border border-dashed border-[var(--line)]">
            <EmptyState
              compact
              title={
                adAccountId
                  ? 'Aucune campagne active détectée'
                  : 'Aucun compte publicitaire'
              }
              hint={
                adAccountId
                  ? 'La détection tourne toutes les 6 h — ou le compte n’a pas de campagne active en ce moment.'
                  : 'Renseigne le compte publicitaire ci-dessus pour détecter les campagnes.'
              }
            />
          </li>
        )}
      </ul>
    </article>
  )
}

// Pour les fiches créées avant : permet de poser le compte publicitaire.
function AdAccountForm({ clientSlug }: { clientSlug: string }) {
  const setAdAccount = useAction(api.clients.setAdAccountChecked)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await setAdAccount({ slug: clientSlug, adAccountId: value })
      setValue('')
    } catch (err) {
      const raw = String(err)
      const cleaned =
        raw.split('Uncaught Error: ').pop()?.split(' at handler')[0] ?? raw
      setError(cleaned.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4">
      <p className="m-0 mb-3 text-sm text-[var(--sea-ink-soft)]">
        Renseigne l'ID du compte publicitaire Meta : toutes ses campagnes
        actives seront rattachées automatiquement.
      </p>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ID du compte, ex. 928367685155102"
          required
          className="field flex-1"
        />
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? 'Vérification…' : 'Connecter'}
        </button>
      </form>
      {error && (
        <p className="m-0 mt-2 text-sm text-[var(--status-warn)]">{error}</p>
      )}
    </div>
  )
}
