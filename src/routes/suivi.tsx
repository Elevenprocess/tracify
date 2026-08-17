import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import CampaignOverview, { STATUS_LABELS } from '../components/CampaignOverview'
import { PipelineBoard } from '../components/ProspectsBoard'
import { EmptyState, PageSkeleton } from '../components/ui'
import {
  ArrowLeftIcon,
  EyeIcon,
  FolderIcon,
  GridIcon,
  LogOutIcon,
  MegaphoneIcon,
  UsersIcon,
} from '../components/icons'
import ClientOverview from '../components/ClientOverview'
import { DocumentList } from '../components/ClientDocuments'
import type { DocumentItem } from '../components/ClientDocuments'
import { isRecent } from '../lib/format'
import { ACCESS_CODE_KEY } from '../lib/accessCode'

export const Route = createFileRoute('/suivi')({
  // ?apercu=<slug> : aperçu admin « voir comme le client » (session requise)
  validateSearch: (search: Record<string, unknown>): { apercu?: string } =>
    typeof search.apercu === 'string' && search.apercu
      ? { apercu: search.apercu }
      : {},
  component: SuiviPage,
})

function SuiviPage() {
  const { apercu } = Route.useSearch()
  return apercu ? <AdminPreview clientSlug={apercu} /> : <ClientSuivi />
}

// Aperçu admin : même page que le client, alimentée par la session de
// l'équipe (aucun code), avec un bandeau pour ne pas confondre.
function AdminPreview({ clientSlug }: { clientSlug: string }) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (!isLoading && !isAuthenticated)
      navigate({
        to: '/login',
        search: { from: `/suivi?apercu=${clientSlug}` },
      })
  }, [isLoading, isAuthenticated, navigate, clientSlug])

  const ready = !isLoading && isAuthenticated
  const data = useQuery(api.access.previewView, ready ? { clientSlug } : 'skip')
  const prospects = useQuery(
    api.access.previewProspects,
    ready ? { clientSlug } : 'skip',
  )
  const documents = useQuery(
    api.access.previewDocuments,
    ready ? { clientSlug } : 'skip',
  )
  const setStatus = useMutation(api.prospects.setStatus)
  const setClientNotes = useMutation(api.prospects.setClientNotes)

  return (
    <>
      <div className="border-b border-[var(--lagoon-line)] bg-[var(--lagoon-tint)] px-4 py-2">
        <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs sm:px-4">
          <p className="m-0 flex items-center gap-2 font-semibold text-[var(--sea-ink)]">
            <EyeIcon className="h-3.5 w-3.5 text-[var(--lagoon)]" />
            Aperçu — vous voyez l'espace de suivi tel que{' '}
            {data?.client.name ?? 'le client'} le voit
            <span className="hidden text-[var(--sea-ink-soft)] sm:inline">
              · les changements de statut sont bien enregistrés
            </span>
          </p>
          <Link
            to="/clients/$clientId"
            params={{ clientId: clientSlug }}
            className="btn btn-ghost btn-sm"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Retour à la fiche
          </Link>
        </div>
      </div>
      <SuiviView
        data={ready ? data : undefined}
        prospects={prospects ?? []}
        documents={documents ?? undefined}
        onSetStatus={(id, status) => setStatus({ id, status })}
        onSaveClientNotes={(id, notes) => setClientNotes({ id, notes })}
        quitLabel="Fermer l'aperçu"
        onQuit={() =>
          navigate({
            to: '/clients/$clientId',
            params: { clientId: clientSlug },
          })
        }
        invalidHint="Ce client n'existe pas (ou plus)."
      />
    </>
  )
}

// Suivi client : accès par code (page de connexion), sans compte ni sidebar —
// les campagnes du client avec la présentation de la vue admin, en lecture
// seule. Un sélecteur bascule entre campagnes s'il y en a plusieurs.
function ClientSuivi() {
  const navigate = useNavigate()
  // undefined = pas encore lu (SSR/hydratation), null = aucun code mémorisé
  const [code, setCode] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    setCode(localStorage.getItem(ACCESS_CODE_KEY))
  }, [])

  useEffect(() => {
    if (code === null) navigate({ to: '/login' })
  }, [code, navigate])

  const data = useQuery(api.access.trackingView, code ? { code } : 'skip')
  const prospects = useQuery(
    api.access.trackingProspects,
    code ? { code } : 'skip',
  )
  const documents = useQuery(
    api.access.trackingDocuments,
    code ? { code } : 'skip',
  )
  const setProspectStatus = useMutation(api.access.trackingSetStatus)
  const setClientNotes = useMutation(api.access.trackingSetClientNotes)

  const quit = () => {
    localStorage.removeItem(ACCESS_CODE_KEY)
    navigate({ to: '/login' })
  }

  return (
    <SuiviView
      data={code ? data : undefined}
      prospects={prospects ?? []}
      documents={documents ?? undefined}
      onSetStatus={(id, next) => {
        if (code) setProspectStatus({ code, id, status: next })
      }}
      onSaveClientNotes={(id, notes) => {
        if (code) setClientNotes({ code, id, notes })
      }}
      quitLabel="Quitter"
      onQuit={quit}
      invalidHint="Il a peut-être été régénéré. Demandez le nouveau code à votre contact Eleven Process."
      invalidTitle="Ce code n'est plus valide"
      invalidAction="Saisir un autre code"
    />
  )
}

type TrackingData = NonNullable<
  ReturnType<typeof useQuery<typeof api.access.trackingView>>
>

type Section =
  | { kind: 'overview' }
  | { kind: 'campaign'; metaId: string }
  | { kind: 'prospects'; campaignId?: string }
  | { kind: 'documents' }

function SuiviView({
  data,
  prospects,
  documents,
  onSetStatus,
  onSaveClientNotes,
  quitLabel,
  onQuit,
  invalidTitle = 'Client introuvable',
  invalidHint,
  invalidAction = 'Retour',
}: {
  data: TrackingData | null | undefined
  prospects: Parameters<typeof PipelineBoard>[0]['prospects']
  documents: Array<DocumentItem> | undefined
  onSetStatus: Parameters<typeof PipelineBoard>[0]['onSetStatus']
  onSaveClientNotes: NonNullable<
    Parameters<typeof PipelineBoard>[0]['onSaveClientNotes']
  >
  quitLabel: string
  onQuit: () => void
  invalidTitle?: string
  invalidHint: string
  invalidAction?: string
}) {
  const [section, setSection] = useState<Section>({ kind: 'overview' })
  const quit = onQuit

  if (data === undefined) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
        <PageSkeleton kpis={4} />
      </main>
    )
  }

  if (data === null) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-8">
        <EmptyState
          title={invalidTitle}
          hint={invalidHint}
          action={
            <button type="button" onClick={quit} className="btn btn-primary">
              {invalidAction}
            </button>
          }
        />
      </main>
    )
  }

  const campaign =
    section.kind === 'campaign'
      ? data.campaigns.find((c) => c.metaId === section.metaId)
      : undefined
  const status = campaign?.status ? STATUS_LABELS[campaign.status] : undefined
  const campaignNames = Object.fromEntries(
    data.campaigns.map((c) => [c.metaId, c.name]),
  )
  const go = (next: Section) => {
    setSection(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const lastSync = data.campaigns.reduce<string | null>(
    (m, c) =>
      c.lastSyncedAt && (m === null || c.lastSyncedAt > m) ? c.lastSyncedAt : m,
    null,
  )
  const updated = campaign ? campaign.lastSyncedAt : lastSync
  const fresh = prospects.filter(
    (p) => p.status === 'new' && p.createdAt && isRecent(p.createdAt),
  ).length

  const filterId = section.kind === 'prospects' ? section.campaignId : undefined
  const shownProspects = filterId
    ? prospects.filter((p) => p.campaignId === filterId)
    : prospects

  const title =
    section.kind === 'overview'
      ? "Vue d'ensemble"
      : section.kind === 'campaign'
        ? (campaign?.name ?? 'Campagne')
        : section.kind === 'prospects'
          ? 'Prospects'
          : 'Dossier'
  const meta =
    section.kind === 'campaign'
      ? '30 derniers jours'
      : section.kind === 'overview'
        ? `${data.campaigns.length} campagne${data.campaigns.length > 1 ? 's' : ''} · 30 derniers jours`
        : section.kind === 'prospects'
          ? `${prospects.length} prospect${prospects.length > 1 ? 's' : ''}${fresh > 0 ? ` · ${fresh} nouveau${fresh > 1 ? 'x' : ''} (24 h)` : ''}`
          : documents
            ? `${documents.length} fichier${documents.length > 1 ? 's' : ''} partagé${documents.length > 1 ? 's' : ''} par Eleven Process`
            : ''

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Barre latérale */}
      <aside className="w-full flex-shrink-0 border-b border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-3 py-5 lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <nav aria-label="Navigation" className="flex h-full flex-col gap-6">
          <div>
            <p className="island-kicker m-0 mb-2 px-3 truncate">
              {data.client.name}
            </p>
            <SideButton
              active={section.kind === 'overview'}
              onClick={() => go({ kind: 'overview' })}
            >
              <GridIcon className="h-4 w-4 flex-shrink-0" />
              Vue d'ensemble
            </SideButton>
          </div>

          <div>
            <p className="island-kicker m-0 mb-2 flex items-center justify-between px-3">
              Campagnes
              <span className="tabular text-[var(--sea-ink-faint)]">
                {data.campaigns.length}
              </span>
            </p>
            <div className="flex flex-col gap-0.5">
              {data.campaigns.map((c) => {
                const st = c.status ? STATUS_LABELS[c.status] : undefined
                return (
                  <SideButton
                    key={c.metaId}
                    active={
                      section.kind === 'campaign' && section.metaId === c.metaId
                    }
                    onClick={() => go({ kind: 'campaign', metaId: c.metaId })}
                  >
                    <MegaphoneIcon className="h-4 w-4 flex-shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {st && (
                      <span
                        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                        style={{ background: st.color }}
                        aria-hidden="true"
                        title={st.label}
                      />
                    )}
                  </SideButton>
                )
              })}
              {data.campaigns.length === 0 && (
                <p className="m-0 px-3 py-1 text-xs text-[var(--sea-ink-faint)]">
                  Aucune campagne pour l'instant.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <SideButton
              active={section.kind === 'prospects'}
              onClick={() => go({ kind: 'prospects' })}
            >
              <UsersIcon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">Prospects</span>
              {fresh > 0 ? (
                <span className="tabular rounded-md bg-[var(--lagoon)] px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--lagoon-ink)]">
                  {fresh}
                </span>
              ) : (
                <span className="tabular text-xs text-[var(--sea-ink-faint)]">
                  {prospects.length}
                </span>
              )}
            </SideButton>
            <SideButton
              active={section.kind === 'documents'}
              onClick={() => go({ kind: 'documents' })}
            >
              <FolderIcon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">Dossier</span>
              {documents && documents.length > 0 && (
                <span className="tabular text-xs text-[var(--sea-ink-faint)]">
                  {documents.length}
                </span>
              )}
            </SideButton>
          </div>

          <div className="mt-auto">
            <button
              type="button"
              onClick={quit}
              className="btn btn-secondary btn-sm w-full justify-center"
            >
              <LogOutIcon className="h-3.5 w-3.5" />
              {quitLabel}
            </button>
          </div>
        </nav>
      </aside>

      {/* Contenu */}
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-7 sm:px-8 lg:py-9">
          <header className="rise-in mb-6">
            <p className="island-kicker m-0 mb-1.5">
              Suivi de vos publicités · {data.client.name}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-2xl font-extrabold tracking-tight text-[var(--sea-ink)] sm:text-[1.9rem]">
                {title}
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
            <p className="m-0 mt-1.5 text-sm text-[var(--sea-ink-soft)]">
              {meta}
              {updated &&
                section.kind !== 'documents' &&
                ` · mis à jour ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(updated))}`}
            </p>
          </header>

          {section.kind === 'overview' && (
            <ClientOverview
              campaigns={data.campaigns}
              prospects={prospects}
              onSelectCampaign={(metaId, tab) =>
                go(
                  tab === 'prospects'
                    ? { kind: 'prospects', campaignId: metaId }
                    : { kind: 'campaign', metaId },
                )
              }
            />
          )}

          {section.kind === 'campaign' &&
            (campaign ? (
              <>
                <CampaignOverview data={campaign} compact />
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      go({ kind: 'prospects', campaignId: campaign.metaId })
                    }
                    className="btn btn-secondary btn-sm"
                  >
                    <UsersIcon className="h-3.5 w-3.5" />
                    Voir les prospects de cette campagne
                    <span className="tabular rounded-md bg-[var(--surface-strong)] px-1.5 py-0.5 text-[11px] font-bold">
                      {
                        prospects.filter(
                          (p) => p.campaignId === campaign.metaId,
                        ).length
                      }
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <div className="island-shell rounded-2xl">
                <EmptyState
                  icon={<MegaphoneIcon className="h-4 w-4" />}
                  title="Campagne introuvable"
                  hint="Elle a peut-être été retirée de votre suivi."
                />
              </div>
            ))}

          {section.kind === 'prospects' && (
            <>
              {data.campaigns.length > 0 && (
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs font-semibold text-[var(--sea-ink-soft)]">
                    Filtrer :
                  </span>
                  <button
                    type="button"
                    aria-pressed={!filterId}
                    onClick={() => setSection({ kind: 'prospects' })}
                    className={`btn btn-sm ${!filterId ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Toutes les campagnes
                    <span className="tabular rounded-md bg-[rgba(0,0,0,0.15)] px-1.5 py-0.5 text-[11px] font-bold">
                      {prospects.length}
                    </span>
                  </button>
                  {data.campaigns.map((c) => {
                    const n = prospects.filter(
                      (p) => p.campaignId === c.metaId,
                    ).length
                    return (
                      <button
                        key={c.metaId}
                        type="button"
                        aria-pressed={filterId === c.metaId}
                        onClick={() =>
                          setSection({
                            kind: 'prospects',
                            campaignId: c.metaId,
                          })
                        }
                        className={`btn btn-sm ${filterId === c.metaId ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        <MegaphoneIcon className="h-3.5 w-3.5" />
                        <span className="max-w-[12rem] truncate">{c.name}</span>
                        <span className="tabular rounded-md bg-[rgba(0,0,0,0.15)] px-1.5 py-0.5 text-[11px] font-bold">
                          {n}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              <PipelineBoard
                title={
                  filterId
                    ? `Prospects · ${campaignNames[filterId] ?? 'campagne'}`
                    : 'Tous vos prospects'
                }
                prospects={shownProspects}
                onSetStatus={onSetStatus}
                onSaveClientNotes={onSaveClientNotes}
                campaignNames={campaignNames}
                emptyHint={
                  filterId
                    ? 'Aucun prospect pour cette campagne'
                    : "Aucun prospect pour l'instant"
                }
              />
            </>
          )}

          {section.kind === 'documents' && (
            <>
              <p className="m-0 mb-4 text-sm text-[var(--sea-ink-soft)]">
                Les documents partagés par Eleven Process (rapports, exports,
                visuels, devis…). Cliquez sur « Télécharger » pour les
                récupérer.
              </p>
              <DocumentList docs={documents} />
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function SideButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  const base =
    'relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 px-3 py-2 text-left text-sm font-semibold transition-colors'
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={
        active
          ? `${base} bg-[var(--lagoon-tint)] text-[var(--sea-ink)] before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-[var(--lagoon)]`
          : `${base} bg-transparent text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]`
      }
    >
      {children}
    </button>
  )
}
