import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { MegaphoneIcon } from './icons'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'var(--status-good)' },
  PAUSED: { label: 'En pause', color: 'var(--status-warn)' },
}

export default function CampaignsPanel({
  clientSlug,
  adAccountId,
}: {
  clientSlug: string
  adAccountId: string | null
}) {
  const campaigns = useQuery(api.meta.campaignsByClient, { clientSlug })

  return (
    <article className="island-shell rise-in rounded-2xl p-5">
      <h2 className="demo-section-title mb-1 flex items-center gap-2">
        <MegaphoneIcon className="h-4 w-4 text-[var(--lagoon)]" />
        Campagnes Meta
      </h2>

      {adAccountId ? (
        <p className="m-0 mb-4 text-sm text-[var(--sea-ink-soft)]">
          Compte publicitaire {adAccountId} — les campagnes actives sont
          détectées et synchronisées automatiquement.
        </p>
      ) : (
        <AdAccountForm clientSlug={clientSlug} />
      )}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(campaigns ?? []).map((c) => {
          const status = c.status ? STATUS_LABELS[c.status] : undefined
          return (
            <li key={c.id}>
              <Link
                to="/campagnes/$campaignId"
                params={{ campaignId: c.metaId }}
                className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3.5 py-2.5 no-underline transition-colors hover:border-[var(--lagoon)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-semibold text-[var(--sea-ink)]">
                    {c.name ?? `Campagne ${c.metaId}`}
                  </p>
                  <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
                    {c.metaId}
                    {c.lastSyncedAt
                      ? ` · synchronisée ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(c.lastSyncedAt))}`
                      : ' · synchronisation en cours…'}
                    {' · voir les créatives →'}
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
              </Link>
            </li>
          )
        })}
        {campaigns !== undefined && campaigns.length === 0 && (
          <li className="rounded-xl border border-dashed border-[var(--line)] px-3.5 py-3 text-sm text-[var(--sea-ink-soft)]">
            {adAccountId
              ? 'Aucune campagne active détectée pour l’instant — la détection tourne, ou le compte n’a pas de campagne active.'
              : 'Renseigne le compte publicitaire pour détecter les campagnes.'}
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
          className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
        />
        <button
          type="submit"
          disabled={saving}
          className="cursor-pointer rounded-lg bg-white px-3.5 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          {saving ? 'Vérification…' : 'Connecter'}
        </button>
      </form>
      {error && (
        <p className="m-0 mt-2 text-sm text-[var(--status-warn)]">{error}</p>
      )}
    </div>
  )
}
