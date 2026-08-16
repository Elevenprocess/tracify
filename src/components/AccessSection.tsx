import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { UsersIcon } from './icons'

// URL du webhook : le site Convex (.convex.site) dérivé de l'URL du déploiement.
const WEBHOOK_URL = `${(
  import.meta.env.VITE_CONVEX_SITE_URL ??
  String(import.meta.env.VITE_CONVEX_URL ?? '').replace(
    '.convex.cloud',
    '.convex.site',
  )
).replace(/\/$/, '')}/api/leads`

// Code d'accès client : généré sur la fiche client, saisi par le client sur
// la page de connexion pour ouvrir le suivi public de ses campagnes.
export default function AccessSection({ clientSlug }: { clientSlug: string }) {
  const current = useQuery(api.access.codeForClient, { clientSlug })
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
          le suivi de ses campagnes en lecture seule. Régénérer ou désactiver le
          code coupe l'accès immédiatement.
        </p>

        {current === undefined ? (
          <p className="demo-muted m-0 mt-4 text-sm">Chargement…</p>
        ) : current === null ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => generate({ clientSlug }))}
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
              onClick={() => run(() => generate({ clientSlug }))}
              className="cursor-pointer rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--sea-ink)] disabled:opacity-60"
            >
              Régénérer
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => revoke({ clientSlug }))}
              className="cursor-pointer rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-[var(--status-warn)] disabled:opacity-60"
            >
              Désactiver
            </button>
          </div>
        )}
      </article>

      <WebhookCard clientSlug={clientSlug} />
    </section>
  )
}

// Clé du webhook d'entrée des leads : à coller dans n8n / GHL / Zapier pour
// que les prospects du client arrivent directement dans son pipeline.
function WebhookCard({ clientSlug }: { clientSlug: string }) {
  const key = useQuery(api.leads.webhookKey, { clientSlug })
  const generate = useMutation(api.leads.generateWebhookKey)
  const revoke = useMutation(api.leads.revokeWebhookKey)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState<'url' | 'key' | 'body' | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setPending(true)
    try {
      await fn()
    } finally {
      setPending(false)
    }
  }
  const copy = async (what: 'url' | 'key' | 'body', text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  const example = key
    ? JSON.stringify(
        {
          key,
          name: 'Prénom Nom',
          phone: '0692 00 00 00',
          email: 'client@example.com',
          source: 'Meta Lead Form',
          campaignId: '(optionnel) ID de campagne Meta',
        },
        null,
        2,
      )
    : ''

  return (
    <article className="island-shell rise-in mt-4 rounded-2xl p-5">
      <h3 className="m-0 text-sm font-bold text-[var(--sea-ink)]">
        Réception des leads (webhook)
      </h3>
      <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
        Envoie les prospects de ce client en <code>POST</code> JSON sur cette
        adresse (depuis n8n, GHL, Zapier…) : ils apparaissent dans son pipeline
        ici et dans son espace client. Les doublons (même téléphone ou email)
        sont ignorés.
      </p>

      {key === undefined ? (
        <p className="demo-muted m-0 mt-4 text-sm">Chargement…</p>
      ) : key === null ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => generate({ clientSlug }))}
          className="mt-4 cursor-pointer rounded-xl bg-[var(--lagoon)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          Activer le webhook
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <Row
            label="URL"
            value={WEBHOOK_URL}
            copied={copied === 'url'}
            onCopy={() => copy('url', WEBHOOK_URL)}
          />
          <Row
            label="Clé"
            value={key}
            copied={copied === 'key'}
            onCopy={() => copy('key', key)}
          />
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="island-kicker">Exemple de corps</span>
              <button
                type="button"
                onClick={() => copy('body', example)}
                className="cursor-pointer rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-xs font-semibold text-[var(--sea-ink)]"
              >
                {copied === 'body' ? 'Copié !' : 'Copier'}
              </button>
            </div>
            <pre className="m-0 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--sea-ink)]">
              {example}
            </pre>
            <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">
              Champs acceptés : name (ou first_name + last_name), phone, email,
              source, medium, campaignId, date. La clé peut aussi passer en
              en-tête <code>Authorization: Bearer …</code>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    "Régénérer la clé ? L'ancienne cessera d'être acceptée.",
                  )
                )
                  run(() => generate({ clientSlug }))
              }}
              className="cursor-pointer rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--sea-ink)] disabled:opacity-60"
            >
              Régénérer la clé
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => revoke({ clientSlug }))}
              className="cursor-pointer rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-[var(--status-warn)] disabled:opacity-60"
            >
              Désactiver
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

function Row({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="island-kicker w-10">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--sea-ink)]">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="cursor-pointer rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-xs font-semibold text-[var(--sea-ink)]"
      >
        {copied ? 'Copié !' : 'Copier'}
      </button>
    </div>
  )
}
