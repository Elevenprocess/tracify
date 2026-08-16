export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-[var(--line)] px-4 py-6 text-[var(--sea-ink-faint)]">
      <div className="page-wrap flex flex-col items-center justify-between gap-2 text-center text-xs sm:flex-row sm:text-left">
        <p className="m-0">&copy; {year} Eleven Process</p>
        <p className="m-0 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--lagoon)]" />
          Tracify · Suivi des campagnes
        </p>
      </div>
    </footer>
  )
}
