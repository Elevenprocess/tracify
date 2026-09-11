import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { isActiveStatus, statusLabel } from './CampaignOverview'
import { ChevronRightIcon, MegaphoneIcon, PauseIcon } from './icons'
import { EmptyState } from './ui'

export interface CampaignAd {
  adId: string
  name: string
  status: string | null
  thumbnailUrl: string | null
}

export interface CampaignItem {
  id: Id<'campaigns'>
  metaId: string
  name: string | null
  status: string | null
  lastSyncedAt: string | null
  syncError: string | null
  origin?: 'meta' | 'ghl' | null
  ads?: Array<CampaignAd>
}

const SYNC_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

// Campagnes Meta d'un client : les actives d'abord, les inactives (en pause,
// en examen, terminées…) dans une section en dessous. Chaque campagne montre
// ses publicités, quel que soit son statut.
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
  const active = (campaigns ?? []).filter((c) => isActiveStatus(c.status))
  const inactive = (campaigns ?? []).filter((c) => !isActiveStatus(c.status))

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
              · toutes les campagnes du compte (actives et inactives) sont
              détectées et synchronisées automatiquement.
            </p>
          )}
        </div>
      </div>

      {!adAccountId && <AdAccountForm clientSlug={clientSlug} />}

      {campaigns === undefined && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {[0, 1].map((i) => (
            <li key={i} className="skeleton h-16 w-full rounded-xl" />
          ))}
        </ul>
      )}

      {campaigns !== undefined && campaigns.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--line)]">
          <EmptyState
            compact
            title={
              adAccountId
                ? 'Aucune campagne détectée'
                : 'Aucun compte publicitaire'
            }
            hint={
              adAccountId
                ? 'La détection tourne toutes les 6 h — ou le compte n’a aucune campagne (les brouillons Meta non publiés ne sont pas visibles).'
                : 'Renseigne le compte publicitaire ci-dessus pour détecter les campagnes.'
            }
          />
        </div>
      )}

      {campaigns !== undefined && campaigns.length > 0 && (
        <>
          <CampaignGroup
            title="Actives"
            tone="var(--status-good)"
            items={active}
            empty="Aucune campagne active en ce moment."
          />
          <CampaignGroup
            title="Inactives"
            tone="var(--status-muted)"
            hint="En pause, en examen ou terminées — leurs publicités restent consultables."
            items={inactive}
            empty="Aucune campagne inactive."
            className="mt-5"
            collapsible
          />
        </>
      )}
    </article>
  )
}

function CampaignGroup({
  title,
  tone,
  hint,
  items,
  empty,
  className = '',
  collapsible = false,
}: {
  title: string
  tone: string
  hint?: string
  items: Array<CampaignItem>
  empty: string
  className?: string
  // Groupe repliable (replié par défaut) : bouton « Développer / Réduire »
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(!collapsible)
  const listId = `campaign-group-${title.toLowerCase()}`
  return (
    <section
      className={className}
      aria-label={`Campagnes ${title.toLowerCase()}`}
    >
      <p className="island-kicker m-0 mb-2 flex flex-wrap items-center gap-2">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: tone }}
          aria-hidden="true"
        />
        {title}
        <span className="tabular text-[var(--sea-ink-faint)]">
          {items.length}
        </span>
        {hint && (
          <span className="ml-1 font-normal normal-case tracking-normal text-[var(--sea-ink-faint)]">
            {hint}
          </span>
        )}
        {collapsible && items.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={listId}
            className="btn btn-ghost btn-sm ml-auto gap-1 px-2 py-1 text-[11px] normal-case tracking-normal"
          >
            <ChevronRightIcon
              className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            {open ? 'Réduire' : 'Développer'}
          </button>
        )}
      </p>
      {collapsible && !open ? null : items.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-[var(--line)] px-3.5 py-2.5 text-xs text-[var(--sea-ink-faint)]">
          {empty}
        </p>
      ) : (
        <ul id={listId} className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((c) => (
            <CampaignRow key={c.id} campaign={c} />
          ))}
        </ul>
      )}
    </section>
  )
}

function CampaignRow({ campaign: c }: { campaign: CampaignItem }) {
  const status = statusLabel(c.status)
  const active = isActiveStatus(c.status)
  const ads = c.ads ?? []
  return (
    <li>
      <Link
        to="/campagnes/$campaignId"
        params={{ campaignId: c.metaId }}
        className={`group flex flex-col rounded-xl border border-[var(--line)] bg-[rgba(255,255,255,0.015)] px-3.5 py-3 no-underline transition-colors hover:border-[var(--lagoon-line)] hover:bg-[var(--lagoon-tint)] ${active ? '' : 'opacity-80 hover:opacity-100'}`}
      >
        <div className="flex items-center gap-3">
          <span className="icon-chip">
            {active ? (
              <MegaphoneIcon className="h-4 w-4" />
            ) : (
              <PauseIcon className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 flex items-center gap-2 text-sm font-semibold text-[var(--sea-ink)]">
              <span className="truncate">
                {c.name ?? `Campagne ${c.metaId}`}
              </span>
              {c.origin === 'ghl' && (
                <span
                  className="flex-shrink-0 rounded-md bg-[var(--lagoon-tint)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--lagoon)]"
                  title="Campagne détectée automatiquement depuis l'attribution d'un lead GoHighLevel"
                >
                  via GHL
                </span>
              )}
            </p>
            <p className="m-0 mt-0.5 text-xs text-[var(--sea-ink-soft)]">
              <span className="tabular">{c.metaId}</span>
              {c.lastSyncedAt
                ? ` · synchronisée ${SYNC_FMT.format(new Date(c.lastSyncedAt))}`
                : ' · synchronisation en cours…'}
              {' · '}
              {ads.length} publicité{ads.length > 1 ? 's' : ''}
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
              style={{ background: status?.color ?? 'var(--status-muted)' }}
              aria-hidden="true"
            />
            {status?.label ?? 'Inconnue'}
          </span>
          <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-[var(--sea-ink-faint)] transition-colors group-hover:text-[var(--lagoon)]" />
        </div>
      </Link>
    </li>
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
