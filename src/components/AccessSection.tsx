import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { UsersIcon } from './icons'

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
    </section>
  )
}
