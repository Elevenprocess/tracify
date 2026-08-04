import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { MegaphoneIcon, PlusIcon, TrashIcon } from './icons'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Active', color: 'var(--status-good)' },
  PAUSED: { label: 'En pause', color: 'var(--status-warn)' },
}

export default function CampaignsPanel({ clientSlug }: { clientSlug: string }) {
  const campaigns = useQuery(api.meta.campaignsByClient, { clientSlug })
  const addCampaign = useMutation(api.meta.addCampaign)
  const removeCampaign = useMutation(api.meta.removeCampaign)

  const [metaId, setMetaId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await addCampaign({ clientSlug, metaId })
      setMetaId('')
    } catch (err) {
      setError(String(err).replace(/^.*Error: /, ''))
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="island-shell rise-in rounded-2xl p-5">
      <h2 className="demo-section-title mb-1 flex items-center gap-2">
        <MegaphoneIcon className="h-4 w-4 text-[var(--lagoon)]" />
        Campagnes Meta
      </h2>
      <p className="m-0 mb-4 text-sm text-[var(--sea-ink-soft)]">
        Colle l'ID d'une campagne Meta : le nom, le statut et les statistiques
        se synchronisent automatiquement.
      </p>

      <form onSubmit={onSubmit} className="mb-4 flex gap-2">
        <input
          value={metaId}
          onChange={(e) => setMetaId(e.target.value)}
          placeholder="ID de campagne, ex. 120246973796860561"
          required
          className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
        />
        <button
          type="submit"
          disabled={saving}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {saving ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>
      {error && (
        <p className="m-0 mb-3 text-sm text-[var(--status-warn)]">{error}</p>
      )}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(campaigns ?? []).map((c) => {
          const status = c.status ? STATUS_LABELS[c.status] : undefined
          return (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3.5 py-2.5"
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
              <button
                type="button"
                aria-label={`Retirer la campagne ${c.name ?? c.metaId}`}
                onClick={() => {
                  if (
                    window.confirm(
                      `Retirer « ${c.name ?? c.metaId} » et ses statistiques ?`,
                    )
                  ) {
                    removeCampaign({ id: c.id })
                  }
                }}
                className="cursor-pointer rounded-lg border-0 bg-transparent p-1.5 text-[var(--sea-ink-soft)] hover:text-[var(--status-warn)]"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          )
        })}
        {campaigns !== undefined && campaigns.length === 0 && (
          <li className="rounded-xl border border-dashed border-[var(--line)] px-3.5 py-3 text-sm text-[var(--sea-ink-soft)]">
            Aucune campagne rattachée — ajoute un ID de campagne Meta pour
            afficher la zone de travail de ce client.
          </li>
        )}
      </ul>
    </article>
  )
}
