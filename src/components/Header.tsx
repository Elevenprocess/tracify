import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-base font-bold tracking-tight text-[var(--sea-ink)] no-underline"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--lagoon)]" />
            Tracify
          </Link>
        </h2>

        <div className="ml-auto flex items-center gap-x-4 text-sm font-semibold sm:gap-x-6">
          <Link
            to="/dashboard"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
            activeOptions={{ exact: true }}
          >
            Tableau de bord
          </Link>
        </div>
      </nav>
    </header>
  )
}
