import { Link } from '@tanstack/react-router'

// Identifiant de l'emplacement où la barre latérale (Sidebar) vient poser sa
// poignée mobile, par portail — le header est rendu au-dessus des routes.
export const SIDEBAR_TRIGGER_SLOT_ID = 'sidebar-trigger-slot'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg sm:px-8">
      <nav className="page-wrap relative flex items-center justify-center py-3 sm:py-4 lg:justify-start">
        {/* Poignée du menu (mobile / tablette), remplie par Sidebar */}
        <span
          id={SIDEBAR_TRIGGER_SLOT_ID}
          className="absolute left-0 top-1/2 flex -translate-y-1/2 items-center lg:hidden"
        />
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-base font-bold tracking-tight text-[var(--sea-ink)] no-underline"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 rounded-full bg-[var(--lagoon)] opacity-60 blur-[3px]" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-[var(--lagoon)]" />
            </span>
            Tracify
          </Link>
        </h2>
      </nav>
    </header>
  )
}
