import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import AppShell from '../components/AppShell'
import CampaignOverview, { STATUS_LABELS } from '../components/CampaignOverview'
import ProspectsBoard from '../components/ProspectsBoard'
import { ArrowLeftIcon, UsersIcon } from '../components/icons'
import RequireAuth from '../components/RequireAuth'

export const Route = createFileRoute('/campagnes/$campaignId')({
  component: CampaignPage,
})

function CampaignPage() {
  return (
    <RequireAuth>
      <AppShell>
        <CampaignDetail />
      </AppShell>
    </RequireAuth>
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

      <CampaignOverview data={data} />

      <AccessSection metaId={data.metaId} />

      <ProspectsBoard campaignId={data.metaId} />
    </main>
  )
}

// Code d'accès client : généré ici, saisi par le client sur la page de
// connexion pour ouvrir le suivi public de cette campagne.
function AccessSection({ metaId }: { metaId: string }) {
  const current = useQuery(api.access.codeForCampaign, { metaId })
  const generate = useMutation(api.access.generate)
  const revoke = useMutation(api.access.revoke)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setPending(true)
    try {
      await fn()
    } finally {
      setPending(false)
    }
  }

  const onCopy = async () => {
    if (!current) return
    await navigator.clipboard.writeText(current.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="mt-6">
      <h2 className="demo-section-title mb-3 flex items-center gap-2">
        <UsersIcon className="h-4 w-4 text-[var(--lagoon)]" />
        Accès client
      </h2>
      <article className="island-shell rise-in rounded-2xl p-5">
        <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
          Transmets ce code au client : saisi sur la page de connexion, il ouvre
          le suivi de cette campagne en lecture seule. Régénérer ou désactiver
          le code coupe l'accès immédiatement.
        </p>

        {current === undefined ? (
          <p className="demo-muted m-0 mt-4 text-sm">Chargement…</p>
        ) : current === null ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => generate({ metaId }))}
            className="mt-4 cursor-pointer rounded-xl bg-[var(--lagoon)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            Générer un code
          </button>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 font-mono text-xl font-bold tracking-[0.3em] text-[var(--sea-ink)]">
              {current.code}
            </span>
            <button
              type="button"
              onClick={onCopy}
              className="cursor-pointer rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--sea-ink)]"
            >
              {copied ? 'Copié !' : 'Copier'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => generate({ metaId }))}
              className="cursor-pointer rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--sea-ink)] disabled:opacity-60"
            >
              Régénérer
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => revoke({ metaId }))}
              className="cursor-pointer rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-[var(--status-warn)] disabled:opacity-60"
            >
              Désactiver
            </button>
          </div>
        )}
      </article>
    </section>
  )
}
