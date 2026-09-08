import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { formatAgo, formatNumber } from '../lib/format'
import {
  AlertIcon,
  CheckIcon,
  CopyIcon,
  KeyIcon,
  RefreshIcon,
  WebhookIcon,
} from './icons'
import { SectionTitle } from './ui'

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
    <section className="mt-8">
      <SectionTitle icon={<KeyIcon className="h-4 w-4" />}>
        Accès client
      </SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="island-shell rise-in flex flex-col rounded-2xl p-5">
          <h3 className="m-0 text-sm font-bold text-[var(--sea-ink)]">
            Code de suivi
          </h3>
          <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--sea-ink-soft)]">
            Transmets ce code au client : saisi sur la page de connexion, il
            ouvre son espace de suivi (campagnes + prospects). Régénérer ou
            désactiver le code coupe l'accès immédiatement.
          </p>

          {current === undefined ? (
            <div className="skeleton mt-4 h-12 w-40" />
          ) : current === null ? (
            <div className="mt-4">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => generate({ clientSlug }))}
                className="btn btn-primary"
              >
                Générer un code
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular rounded-xl border border-[var(--lagoon-line)] bg-[var(--lagoon-tint)] px-4 py-2 font-mono text-xl font-extrabold tracking-[0.3em] text-[var(--sea-ink)]">
                  {current.code}
                </span>
                <button
                  type="button"
                  onClick={onCopy}
                  className="btn btn-secondary btn-sm"
                >
                  {copied ? (
                    <CheckIcon className="h-3.5 w-3.5 text-[var(--status-good)]" />
                  ) : (
                    <CopyIcon className="h-3.5 w-3.5" />
                  )}
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => generate({ clientSlug }))}
                  className="btn btn-ghost btn-sm"
                >
                  Régénérer
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => revoke({ clientSlug }))}
                  className="btn btn-danger btn-sm"
                >
                  Désactiver
                </button>
              </div>
            </div>
          )}
        </article>

        <WebhookCard clientSlug={clientSlug} ghlGuide />
      </div>
    </section>
  )
}

// Synchro GoHighLevel d'une campagne : on renseigne l'ID du sous-compte
// (Location ID) et Tracify récupère ses nouveaux contacts toutes les 10 min
// dans le CRM de la campagne — aucun réglage côté GHL. Bouton pour lancer
// une synchro immédiate.
export function GhlCard({ metaId }: { metaId: string }) {
  const status = useQuery(api.ghl.campaignStatus, { metaId })
  const ghl = status?.ghl ?? null
  const fromGhl = status?.fromGhl ?? 0
  const setLocation = useMutation(api.ghl.setLocation)
  const syncNow = useAction(api.ghl.syncNow)
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (pending) return
    setPending(true)
    try {
      await setLocation({ metaId, locationId: value })
      setEditing(false)
      setValue('')
      setResult(null)
    } finally {
      setPending(false)
    }
  }

  const run = async () => {
    if (pending) return
    setPending(true)
    setResult(null)
    try {
      const r = await syncNow({ metaId })
      setResult(
        r.ok
          ? `${formatNumber(r.inserted)} nouveau${r.inserted > 1 ? 'x' : ''} prospect${r.inserted > 1 ? 's' : ''} · ${formatNumber(r.duplicates)} déjà connu${r.duplicates > 1 ? 's' : ''}${r.noCampaign ? ` · ${formatNumber(r.noCampaign)} sans campagne ignoré${r.noCampaign > 1 ? 's' : ''}` : ''}${r.skipped ? ` · ${formatNumber(r.skipped)} sans coordonnées ignoré${r.skipped > 1 ? 's' : ''}` : ''}`
          : `Erreur : ${r.error ?? 'inconnue'}`,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <article className="island-shell rise-in flex flex-col rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 flex items-center gap-2 text-sm font-bold text-[var(--sea-ink)]">
            <RefreshIcon className="h-4 w-4 text-[var(--lagoon)]" />
            Synchro GoHighLevel
          </h3>
          <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--sea-ink-soft)]">
            Filet de sécurité du webhook : les nouveaux contacts du sous-compte
            GHL sont relus toutes les 10 min. Chacun est rangé dans la campagne
            Meta de son attribution (créée si nouvelle) — jamais dans une autre
            ; sans campagne ou sans téléphone/email, il est ignoré. Rien à
            configurer côté GHL.
          </p>
        </div>
        {ghl && !editing && (
          <button
            type="button"
            disabled={pending}
            onClick={run}
            className="btn btn-primary btn-sm"
          >
            <RefreshIcon
              className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`}
            />
            {pending ? 'Synchro…' : 'Synchroniser maintenant'}
          </button>
        )}
      </div>

      {ghl && !editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--sea-ink-soft)]">
          <span>
            Sous-compte{' '}
            <span className="tabular text-[var(--sea-ink)]">
              {ghl.locationId}
            </span>
          </span>
          <span>
            {ghl.lastSyncAt
              ? `Dernière synchro ${formatAgo(ghl.lastSyncAt)}`
              : 'Pas encore synchronisé'}
          </span>
          <span>
            <strong className="text-[var(--sea-ink)]">
              {formatNumber(fromGhl)}
            </strong>{' '}
            prospect{fromGhl > 1 ? 's' : ''} venu{fromGhl > 1 ? 's' : ''} de GHL
          </span>
          <button
            type="button"
            onClick={() => {
              setValue(ghl.locationId)
              setEditing(true)
            }}
            className="btn btn-ghost btn-sm"
          >
            Modifier
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="mt-4 flex flex-wrap gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Location ID GHL, ex. djBlEHfSx8UmYXjUqhCS"
            className="field min-w-0 flex-1"
          />
          <button type="submit" disabled={pending} className="btn btn-primary">
            {ghl ? 'Enregistrer' : 'Rattacher'}
          </button>
          {ghl && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn btn-ghost"
            >
              Annuler
            </button>
          )}
        </form>
      )}

      {ghl?.error && !editing && (
        <p className="m-0 mt-3 flex items-center gap-2 text-xs text-[var(--status-warn)]">
          <AlertIcon className="h-3.5 w-3.5 flex-shrink-0" />
          Dernière synchro en erreur : {ghl.error}
        </p>
      )}
      {result && (
        <p className="m-0 mt-3 flex items-center gap-2 text-xs text-[var(--sea-ink)]">
          <CheckIcon className="h-3.5 w-3.5 text-[var(--status-good)]" />
          {result}
        </p>
      )}
    </article>
  )
}

// Clé du webhook d'entrée des leads : à coller dans l'action « Webhook »
// d'un workflow GoHighLevel (ou n8n / Zapier). Chaque lead est rangé dans la
// campagne Meta de son attribution, créée dans Tracify si elle est nouvelle.
export function WebhookCard({
  clientSlug,
  campaignId,
  ghlGuide = false,
}: {
  clientSlug: string
  // Sur la page campagne : l'exemple est pré-rempli avec cet ID (envoi
  // manuel depuis n8n/Zapier) ; les payloads GHL sont aiguillés tout seuls.
  campaignId?: string
  // Fiche client : pas à pas de branchement GHL + état des réceptions.
  ghlGuide?: boolean
}) {
  const status = useQuery(api.leads.webhookStatus, { clientSlug })
  const key = status === undefined ? undefined : (status?.key ?? null)
  const generate = useMutation(api.leads.generateWebhookKey)
  const revoke = useMutation(api.leads.revokeWebhookKey)
  const detectNow = useAction(api.ghl.detectNow)
  const [pending, setPending] = useState(false)
  const [location, setLocation] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<string | null>(null)

  const runDetect = async (e: FormEvent) => {
    e.preventDefault()
    const value = location.trim() || status?.ghl?.locationId || ''
    if (!value || detecting) return
    setDetecting(true)
    setDetected(null)
    try {
      const r = await detectNow({ clientSlug, locationId: value })
      setDetected(
        r.ok
          ? `${formatNumber(r.scanned)} contact${r.scanned > 1 ? 's' : ''} relu${r.scanned > 1 ? 's' : ''} sur 90 jours · ${formatNumber(r.inserted)} prospect${r.inserted > 1 ? 's' : ''} importé${r.inserted > 1 ? 's' : ''} · ${formatNumber(r.duplicates)} déjà connu${r.duplicates > 1 ? 's' : ''} · ${formatNumber(r.noCampaign)} sans campagne`
          : `Erreur : ${r.error ?? 'inconnue'}`,
      )
      setLocation('')
    } catch (err) {
      setDetected(
        `Erreur : ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setDetecting(false)
    }
  }
  const [copied, setCopied] = useState<
    'url' | 'key' | 'body' | 'ghlUrl' | null
  >(null)

  const run = async (fn: () => Promise<unknown>) => {
    setPending(true)
    try {
      await fn()
    } finally {
      setPending(false)
    }
  }
  const copy = async (
    what: 'url' | 'key' | 'body' | 'ghlUrl',
    text: string,
  ) => {
    await navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  const ghlUrl = key ? `${WEBHOOK_URL}?key=${key}` : ''
  const example = key
    ? JSON.stringify(
        {
          key,
          name: 'Prénom Nom',
          phone: '0692 00 00 00',
          email: 'client@example.com',
          source: 'Meta Lead Form',
          campaignId: campaignId ?? '(optionnel) ID de campagne Meta',
        },
        null,
        2,
      )
    : ''

  return (
    <article className="island-shell rise-in flex flex-col rounded-2xl p-5">
      <h3 className="m-0 flex items-center gap-2 text-sm font-bold text-[var(--sea-ink)]">
        <WebhookIcon className="h-4 w-4 text-[var(--lagoon)]" />
        {ghlGuide ? 'Webhook GoHighLevel' : 'Réception des leads (webhook)'}
      </h3>
      <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--sea-ink-soft)]">
        {ghlGuide ? (
          <>
            Un seul webhook pour ce client, à coller dans un workflow GHL :
            chaque lead est rangé dans la{' '}
            <strong className="text-[var(--sea-ink)]">
              campagne Meta de son attribution
            </strong>{' '}
            (campagne 1 → campagne 1, jamais dans une autre). Une campagne
            inconnue est créée automatiquement dans « Campagnes Meta » ; un lead
            sans campagne ou déjà connu est ignoré.
          </>
        ) : (
          <>
            Envoie les prospects de ce client en <code>POST</code> JSON sur
            cette adresse (depuis n8n, Zapier…). Les leads GoHighLevel sont
            aiguillés par leur attribution ; pour un envoi manuel, indique{' '}
            <code>campaignId</code>. Les doublons (même téléphone ou email) sont
            ignorés.
          </>
        )}
      </p>

      {key === undefined ? (
        <div className="skeleton mt-4 h-9 w-full" />
      ) : key === null ? (
        <div className="mt-auto pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => generate({ clientSlug }))}
            className="btn btn-primary"
          >
            Activer le webhook
          </button>
        </div>
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
          {ghlGuide && (
            <>
              <ol className="m-0 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-[var(--sea-ink-soft)]">
                <li>
                  Dans GHL : <strong>Automatisation → Workflows</strong>, créer
                  un workflow vierge.
                </li>
                <li>
                  Déclencheur <strong>« Contact créé »</strong> (ou « Facebook
                  Lead Form Submitted » pour ne prendre que les pubs).
                </li>
                <li>
                  Action <strong>« Webhook »</strong>, méthode POST, coller
                  l'URL ci-dessous (la clé est dedans), corps par défaut.
                </li>
                <li>Publier le workflow. C'est tout côté GHL.</li>
              </ol>
              <Row
                label="GHL"
                value={ghlUrl}
                copied={copied === 'ghlUrl'}
                onCopy={() => copy('ghlUrl', ghlUrl)}
              />
              <div className="rounded-xl border border-[var(--lagoon-line)] bg-[var(--lagoon-tint)] px-3 py-2.5">
                <p className="m-0 text-xs font-bold text-[var(--sea-ink)]">
                  Sans attendre le premier lead
                </p>
                <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-[var(--sea-ink-soft)]">
                  Indique le sous-compte GHL du client (Paramètres → Profil de
                  l'entreprise → « Location ID ») : Tracify relit tout de suite
                  ses contacts des 90 derniers jours pour créer les campagnes,
                  rattacher le compte publicitaire Meta et importer les
                  prospects déjà attribués. Ensuite les nouveaux contacts sont
                  relus toutes les 10 min, en plus du webhook.
                </p>
                <form
                  onSubmit={runDetect}
                  className="mt-2 flex flex-wrap gap-2"
                >
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={
                      status?.ghl?.locationId ??
                      'Location ID, ex. djBlEHfSx8UmYXjUqhCS'
                    }
                    className="field min-w-0 flex-1"
                  />
                  <button
                    type="submit"
                    disabled={detecting || (!location.trim() && !status?.ghl)}
                    className="btn btn-primary btn-sm"
                  >
                    <RefreshIcon
                      className={`h-3.5 w-3.5 ${detecting ? 'animate-spin' : ''}`}
                    />
                    {detecting ? 'Détection…' : 'Détecter maintenant'}
                  </button>
                </form>
                {status?.ghl && (
                  <p className="m-0 mt-2 text-[11px] text-[var(--sea-ink-soft)]">
                    Sous-compte{' '}
                    <span className="tabular text-[var(--sea-ink)]">
                      {status.ghl.locationId}
                    </span>
                    {status.ghl.lastSyncAt
                      ? ` · dernière relecture ${formatAgo(status.ghl.lastSyncAt)}`
                      : ' · pas encore relu'}
                    {status.adAccountId
                      ? ` · compte publicitaire ${status.adAccountId}`
                      : ' · compte publicitaire pas encore rattaché'}
                  </p>
                )}
                {status?.ghl?.error && (
                  <p className="m-0 mt-1 flex items-center gap-1 text-[11px] text-[var(--status-warn)]">
                    <AlertIcon className="h-3 w-3 flex-shrink-0" />
                    Dernière relecture en erreur : {status.ghl.error}
                  </p>
                )}
                {detected && (
                  <p className="m-0 mt-1 flex items-center gap-1 text-[11px] text-[var(--sea-ink)]">
                    <CheckIcon className="h-3 w-3 text-[var(--status-good)]" />
                    {detected}
                  </p>
                )}
              </div>
              {status && (
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] px-3 py-2 text-xs text-[var(--sea-ink-soft)]">
                  {status.lastAt ? (
                    <>
                      <p className="m-0">
                        <CheckIcon className="mr-1 inline h-3.5 w-3.5 text-[var(--status-good)]" />
                        Relié à GHL · dernière réception{' '}
                        {formatAgo(status.lastAt)}
                        {status.lastOutcome ? ` : ${status.lastOutcome}` : ''}
                      </p>
                      <p className="m-0 mt-1">
                        <strong className="text-[var(--sea-ink)]">
                          {formatNumber(status.counts.received)}
                        </strong>{' '}
                        reçu{status.counts.received > 1 ? 's' : ''} ·{' '}
                        {formatNumber(status.counts.imported)} ajouté
                        {status.counts.imported > 1 ? 's' : ''} ·{' '}
                        {formatNumber(status.counts.duplicates)} déjà connu
                        {status.counts.duplicates > 1 ? 's' : ''} ·{' '}
                        {formatNumber(status.counts.noCampaign)} sans campagne
                      </p>
                    </>
                  ) : (
                    <p className="m-0">
                      <AlertIcon className="mr-1 inline h-3.5 w-3.5 text-[var(--status-warn)]" />
                      Aucune réception pour l'instant : publie le workflow GHL,
                      le premier lead apparaîtra ici.
                    </p>
                  )}
                  {status.detected.length > 0 && (
                    <p className="m-0 mt-1">
                      Campagne{status.detected.length > 1 ? 's' : ''} détectée
                      {status.detected.length > 1 ? 's' : ''} via GHL :{' '}
                      {status.detected
                        .map((c) => c.name ?? c.metaId)
                        .join(', ')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {!ghlGuide && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="island-kicker">Exemple de corps</span>
                <button
                  type="button"
                  onClick={() => copy('body', example)}
                  className="btn btn-ghost btn-sm"
                >
                  {copied === 'body' ? (
                    <CheckIcon className="h-3 w-3 text-[var(--status-good)]" />
                  ) : (
                    <CopyIcon className="h-3 w-3" />
                  )}
                  {copied === 'body' ? 'Copié' : 'Copier'}
                </button>
              </div>
              <pre className="m-0 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] p-3 text-[11px] leading-relaxed text-[var(--sea-ink)]">
                {example}
              </pre>
              <p className="m-0 mt-1.5 text-[11px] leading-relaxed text-[var(--sea-ink-faint)]">
                Champs acceptés : name (ou first_name + last_name), phone,
                email, source, medium, campaignId, date. La clé peut aussi
                passer en en-tête <code>Authorization: Bearer …</code>.
              </p>
            </div>
          )}
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
              className="btn btn-ghost btn-sm"
            >
              Régénérer la clé
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => revoke({ clientSlug }))}
              className="btn btn-danger btn-sm"
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
    <div className="flex items-center gap-2">
      <span className="island-kicker w-9 flex-shrink-0">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--line)] bg-[var(--surface-solid)] px-3 py-1.5 text-[11px] text-[var(--sea-ink)]">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copier ${label}`}
        className="btn btn-ghost btn-sm flex-shrink-0 px-2"
      >
        {copied ? (
          <CheckIcon className="h-3.5 w-3.5 text-[var(--status-good)]" />
        ) : (
          <CopyIcon className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  )
}
