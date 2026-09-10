// Barre latérale commune (admin + espace client) :
// - ordinateur : collée au bord gauche, se replie en colonne d'icônes
//   (état mémorisé dans localStorage) ;
// - mobile : tiroir qui glisse depuis la gauche par-dessus le contenu,
//   ouvert par une poignée fixée au bord de l'écran. Jamais de barre
//   horizontale.
import { Children, createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon, MenuIcon, XIcon } from './icons'

const STORAGE_KEY = 'tracify:sidebar'

const SidebarContext = createContext<{ collapsed: boolean }>({
  collapsed: false,
})
export const useSidebar = () => useContext(SidebarContext)

export function Sidebar({
  label,
  ariaLabel = 'Navigation',
  children,
}: {
  // Nom affiché en tête (client, ou « Tracify »)
  label: string
  ariaLabel?: string
  children: ReactNode
}) {
  // Mobile : tiroir ouvert / fermé
  const [open, setOpen] = useState(false)
  // Ordinateur : repliée en icônes
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === 'collapsed')
    } catch {
      /* stockage indisponible : on reste déplié */
    }
  }, [])
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? 'expanded' : 'collapsed')
      } catch {
        /* ignore */
      }
      return !c
    })

  // Échap ferme le tiroir mobile
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <SidebarContext.Provider value={{ collapsed }}>
      {/* Poignée mobile, fixée au bord gauche */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          className="fixed left-0 top-[72px] z-40 flex h-10 w-9 cursor-pointer items-center justify-center rounded-r-xl border border-l-0 border-[var(--line)] bg-[var(--surface-solid)] text-[var(--sea-ink)] shadow-[0_8px_22px_rgba(0,0,0,0.25)] lg:hidden"
        >
          <MenuIcon className="h-4 w-4" />
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.55)] backdrop-blur-[2px] lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`side-nav ${collapsed ? 'is-collapsed' : ''} fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-shrink-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--bg-base)] px-3 py-4 transition-[transform,width] duration-200 lg:sticky lg:top-[57px] lg:z-auto lg:h-[calc(100vh-57px)] lg:max-w-none lg:translate-x-0 lg:bg-[rgba(255,255,255,0.02)] lg:py-6 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-16 lg:px-2' : 'lg:w-64 lg:px-4'}`}
      >
        <div
          className={`mb-4 flex items-center gap-2 ${
            collapsed ? 'lg:justify-center' : 'justify-between'
          }`}
        >
          <span className="side-label island-kicker m-0 min-w-0 flex-1 truncate px-3">
            {label}
          </span>
          {/* Mobile : fermer le tiroir (.btn force display, d'où le span) */}
          <span className="lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
              className="btn btn-ghost btn-sm px-2"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </span>
          {/* Ordinateur : replier / déplier */}
          <span className="hidden lg:inline-flex">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
              title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
              className="btn btn-ghost btn-sm px-2"
            >
              {collapsed ? (
                <ChevronRightIcon className="h-4 w-4" />
              ) : (
                <ChevronLeftIcon className="h-4 w-4" />
              )}
            </button>
          </span>
        </div>
        <nav
          aria-label={ariaLabel}
          className="flex min-h-0 flex-1 flex-col gap-6"
          onClick={(e) => {
            // Choisir une rubrique referme le tiroir mobile
            const t = e.target as HTMLElement
            if (t.closest('a,button[data-nav]')) setOpen(false)
          }}
        >
          {children}
        </nav>
      </aside>
    </SidebarContext.Provider>
  )
}

// Texte des entrées : en mode replié, seule l'icône (premier enfant) reste,
// le libellé passe en info-bulle.
function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) =>
      typeof c === 'string' || typeof c === 'number' ? String(c) : '',
    )
    .join(' ')
    .trim()
}

const BASE =
  'relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold no-underline transition-colors'
const IDLE = `${BASE} text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]`
const ACTIVE = `${BASE} bg-[var(--lagoon-tint)] text-[var(--sea-ink)] before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-[var(--lagoon)]`
const COLLAPSED = 'lg:justify-center lg:px-0'

export function SideLink({
  to,
  params,
  title,
  children,
}: {
  to: string
  params?: Record<string, string>
  title?: string
  children: ReactNode
}) {
  const { collapsed } = useSidebar()
  const kids = Children.toArray(children)
  return (
    <Link
      to={to}
      params={params}
      title={collapsed ? (title ?? textOf(children)) : undefined}
      className={`${IDLE} ${collapsed ? COLLAPSED : ''}`}
      activeProps={{ className: `${ACTIVE} ${collapsed ? COLLAPSED : ''}` }}
    >
      {collapsed ? (
        <>
          {kids[0]}
          <span className="side-label contents">{kids.slice(1)}</span>
        </>
      ) : (
        children
      )}
    </Link>
  )
}

export function SideButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  const { collapsed } = useSidebar()
  const kids = Children.toArray(children)
  return (
    <button
      type="button"
      data-nav="true"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      title={collapsed ? (title ?? textOf(children)) : undefined}
      className={`${active ? ACTIVE : IDLE} cursor-pointer border-0 ${
        active ? '' : 'bg-transparent'
      } ${collapsed ? COLLAPSED : ''}`}
    >
      {collapsed ? (
        <>
          {kids[0]}
          <span className="side-label contents">{kids.slice(1)}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}
