import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from './icons'

// Primitives d'interface partagées par toutes les pages : en-tête de page,
// état vide, squelettes de chargement.

export function PageHeader({
  kicker,
  title,
  meta,
  badge,
  actions,
  back,
}: {
  kicker?: ReactNode
  title: ReactNode
  meta?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  back?: { to: string; params?: Record<string, string>; label: string }
}) {
  return (
    <header className="rise-in mb-7">
      {back && (
        <nav aria-label="Fil d'Ariane" className="mb-3 text-sm">
          <Link
            to={back.to}
            params={back.params}
            className="inline-flex items-center gap-1.5 text-[var(--sea-ink-soft)] no-underline hover:text-[var(--sea-ink)]"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            {back.label}
          </Link>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {kicker && <p className="island-kicker m-0 mb-1.5">{kicker}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-2xl font-extrabold tracking-tight text-[var(--sea-ink)] sm:text-[1.9rem]">
              {title}
            </h1>
            {badge}
          </div>
          {meta && (
            <p className="m-0 mt-1.5 text-sm text-[var(--sea-ink-soft)]">
              {meta}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  )
}

export function SectionTitle({
  icon,
  children,
  aside,
  className = '',
}: {
  icon?: ReactNode
  children: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`mb-3 flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <h2 className="demo-section-title m-0 flex items-center gap-2">
        {icon && <span className="text-[var(--lagoon)]">{icon}</span>}
        {children}
      </h2>
      {aside}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  compact = false,
}: {
  icon?: ReactNode
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-12'}`}
    >
      {icon && (
        <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--sea-ink-soft)]">
          {icon}
        </span>
      )}
      <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{title}</p>
      {hint && (
        <p className="m-0 max-w-sm text-xs leading-relaxed text-[var(--sea-ink-soft)]">
          {hint}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />
}

// Squelette d'une page « KPI + graphiques + tableau », utilisé pendant le
// premier chargement pour éviter le texte « Chargement… » et le saut de mise
// en page.
export function PageSkeleton({ kpis = 3 }: { kpis?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="min-w-0">
      <span className="sr-only">Chargement des données…</span>
      <div className="mb-7">
        <Skeleton className="mb-2 h-3 w-40" />
        <Skeleton className="h-8 w-72 max-w-full" />
      </div>
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(${kpis > 3 ? '180px' : '220px'}, 1fr))`,
        }}
      >
        {Array.from({ length: kpis }, (_, i) => (
          <div key={i} className="island-shell rounded-2xl p-5">
            <Skeleton className="mb-4 h-3 w-24" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="island-shell rounded-2xl p-5">
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="h-44 w-full" />
        </div>
        <div className="island-shell rounded-2xl p-5">
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
      <div className="island-shell mt-6 rounded-2xl p-5">
        <Skeleton className="mb-4 h-4 w-40" />
        <Skeleton className="mb-2 h-9 w-full" />
        <Skeleton className="mb-2 h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  )
}
