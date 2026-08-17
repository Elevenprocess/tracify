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
  GridIcon,
  LogOutIcon,
  MegaphoneIcon,
  TrendIcon,
  UsersIcon,
} from '../components/icons'
import ClientOverview from '../components/ClientOverview'
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
  const setStatus = useMutation(api.prospects.setStatus)
  const setClientNotes = useMutation(api.prospects.setClientNotes)

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-[var(--lagoon-line)] bg-[var(--lagoon-tint)] px-4 py-2 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 sm:px-4 text-xs">
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

type ClientTab = 'performance' | 'prospects'

function SuiviView({
  data,
  prospects,
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
  // null = vue d'ensemble, sinon l'ID Meta de la campagne ouverte
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<ClientTab>('performance')
  // Onglet Prospects : tous les prospects du client par défaut (la plupart ne
  // sont pas rattachés à une campagne), filtre « cette campagne seulement ».
  const [onlyThisCampaign, setOnlyThisCampaign] = useState(false)
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

  const campaign = selected
    ? data.campaigns.find((c) => c.metaId === selected)
    : undefined
  const status = campaign?.status ? STATUS_LABELS[campaign.status] : undefined
  const campaignNames = Object.fromEntries(
    data.campaigns.map((c) => [c.metaId, c.name]),
  )
  const campaignProspects = campaign
    ? prospects.filter((p) => p.campaignId === campaign.metaId)
    : []
  const openCampaign = (metaId: string, t: ClientTab = 'performance') => {
    setSelected(metaId)
    setTab(t)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const lastSync = data.campaigns.reduce<string | null>(
    (m, c) =>
      c.lastSyncedAt && (m === null || c.lastSyncedAt > m) ? c.lastSyncedAt : m,
    null,
  )
  const updated = campaign ? campaign.lastSyncedAt : lastSync

  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-7 sm:px-8 lg:py-9">
      <header className="rise-in mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="island-kicker m-0 mb-1.5">
              Suivi de vos publicités · {data.client.name}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-2xl font-extrabold tracking-tight text-[var(--sea-ink)] sm:text-[1.9rem]">
                {campaign ? campaign.name : "Vue d'ensemble"}
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
              {campaign
                ? '30 derniers jours'
                : `${data.campaigns.length} campagne${data.campaigns.length > 1 ? 's' : ''} · 30 derniers jours`}
              {updated &&
                ` · mis à jour ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(updated))}`}
            </p>
          </div>
          <button type="button" onClick={quit} className="btn btn-ghost btn-sm">
            <LogOutIcon className="h-3.5 w-3.5" />
            {quitLabel}
          </button>
        </div>

        {/* Navigation : vue d'ensemble + une entrée par campagne */}
        <nav
          aria-label="Navigation"
          className="mt-5 inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1"
        >
          <NavButton
            active={!campaign}
            onClick={() => {
              setSelected(null)
            }}
          >
            <GridIcon className="h-3.5 w-3.5" />
            Vue d'ensemble
          </NavButton>
          {data.campaigns.map((c) => (
            <NavButton
              key={c.metaId}
              active={c.metaId === campaign?.metaId}
              onClick={() => openCampaign(c.metaId, tab)}
            >
              <MegaphoneIcon className="h-3.5 w-3.5" />
              <span className="max-w-[14rem] truncate">{c.name}</span>
            </NavButton>
          ))}
        </nav>
      </header>

      {!campaign ? (
        <>
          <ClientOverview
            campaigns={data.campaigns}
            prospects={prospects}
            onSelectCampaign={openCampaign}
          />
        </>
      ) : (
        <>
          {/* Onglets de la campagne */}
          <div
            role="tablist"
            aria-label="Sections de la campagne"
            className="mb-5 flex gap-1 border-b border-[var(--line)]"
          >
            <TabButton
              active={tab === 'performance'}
              onClick={() => setTab('performance')}
            >
              <TrendIcon className="h-3.5 w-3.5" />
              Performance & créatives
            </TabButton>
            <TabButton
              active={tab === 'prospects'}
              onClick={() => setTab('prospects')}
            >
              <UsersIcon className="h-3.5 w-3.5" />
              Prospects
              <span className="tabular rounded-md bg-[var(--surface-strong)] px-1.5 py-0.5 text-[11px] font-bold">
                {prospects.length}
              </span>
            </TabButton>
          </div>

          {tab === 'performance' ? (
            <CampaignOverview data={campaign} compact />
          ) : (
            <PipelineBoard
              title={
                onlyThisCampaign
                  ? 'Prospects de la campagne'
                  : 'Tous vos prospects'
              }
              prospects={onlyThisCampaign ? campaignProspects : prospects}
              onSetStatus={onSetStatus}
              onSaveClientNotes={onSaveClientNotes}
              campaignNames={campaignNames}
              emptyHint={
                onlyThisCampaign
                  ? 'Aucun prospect pour cette campagne'
                  : "Aucun prospect pour l'instant"
              }
              action={
                <button
                  type="button"
                  aria-pressed={onlyThisCampaign}
                  onClick={() => setOnlyThisCampaign((v) => !v)}
                  className={`btn btn-sm ${onlyThisCampaign ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <MegaphoneIcon className="h-3.5 w-3.5" />
                  Cette campagne seulement
                  <span className="tabular rounded-md bg-[rgba(0,0,0,0.15)] px-1.5 py-0.5 text-[11px] font-bold">
                    {campaignProspects.length}
                  </span>
                </button>
              }
            />
          )}
        </>
      )}
    </main>
  )
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex max-w-full cursor-pointer items-center gap-1.5 rounded-lg border-0 px-3 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'bg-[var(--lagoon)] text-[var(--lagoon-ink)]'
          : 'bg-transparent text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]'
      }`}
    >
      {children}
    </button>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px flex cursor-pointer items-center gap-1.5 border-0 border-b-2 bg-transparent px-3 py-2.5 text-sm font-semibold transition-colors ${
        active
          ? 'border-[var(--lagoon)] text-[var(--sea-ink)]'
          : 'border-transparent text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
      }`}
    >
      {children}
    </button>
  )
}
