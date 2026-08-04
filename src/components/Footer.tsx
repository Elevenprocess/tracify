export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-[var(--line)] px-4 pb-10 pt-8 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm">&copy; {year} Eleven Process</p>
        <p className="island-kicker m-0">Tracify · Suivi des campagnes</p>
      </div>
    </footer>
  )
}
