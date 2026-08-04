import { Link, createFileRoute } from '@tanstack/react-router'
import Prism from '../components/Prism/Prism'

export const Route = createFileRoute('/')({ component: Landing })

const FEATURES = [
  {
    title: 'Suivi en temps réel',
    description:
      'Dépense, prospects et coût par prospect synchronisés en continu — le tableau de bord se met à jour tout seul.',
  },
  {
    title: 'Tous vos clients au même endroit',
    description:
      'Une vue d’ensemble de chaque compte publicitaire, et une fiche détaillée par client avec ses sources et ses prospects.',
  },
  {
    title: 'Pensé pour les agents IA',
    description:
      'Une base de données ouverte et structurée, prête à être lue et pilotée par des agents autonomes.',
  },
]

function Landing() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero plein écran avec le fond animé */}
      <section className="relative h-screen w-full overflow-hidden">
        <div className="absolute inset-0">
          <Prism
            animationType="rotate"
            timeScale={0.4}
            height={4}
            baseWidth={4.6}
            scale={2.7}
            hueShift={0.3584}
            colorFrequency={1}
            noise={0}
            glow={1.1}
            suspendWhenOffscreen
          />
        </div>

        {/* Navbar flottante */}
        <nav className="pointer-events-none absolute inset-x-4 top-4 z-20 sm:inset-x-8 sm:top-6">
          <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-md sm:px-6">
            <Link
              to="/"
              className="flex items-center gap-2 text-lg font-bold tracking-tight text-white no-underline"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-[linear-gradient(90deg,#60d7cf,#837de6)]" />
              Tracify
            </Link>
            <div className="flex items-center gap-3 sm:gap-6">
              <a
                href="#fonctionnalites"
                className="hidden text-sm font-medium text-white/60 no-underline transition-colors hover:text-white sm:block"
              >
                Fonctionnalités
              </a>
              <Link
                to="/dashboard"
                className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-black no-underline transition-transform hover:-translate-y-0.5"
              >
                Ouvrir le dashboard
              </Link>
            </div>
          </div>
        </nav>

        {/* Contenu du hero — laisse passer le clic maintenu vers l'animation */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-4 text-center">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] py-1.5 pl-1.5 pr-4 text-sm text-white/60 backdrop-blur-md">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold tracking-wide text-black">
              NOUVEAU
            </span>
            Suivi des campagnes en temps réel
          </p>
          <h1 className="m-0 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Toutes vos campagnes clients. Une seule plateforme.
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/60 sm:text-lg">
            Tracify centralise la dépense publicitaire, les prospects et la
            performance de chaque client Eleven Process — en direct.
          </p>
          <div className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/dashboard"
              className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-black no-underline transition-transform hover:-translate-y-0.5"
            >
              Accéder au tableau de bord
            </Link>
            <a
              href="#fonctionnalites"
              className="rounded-xl border border-white/15 bg-white/[0.06] px-6 py-3 text-sm font-semibold text-white/80 no-underline backdrop-blur-md transition-colors hover:bg-white/[0.12] hover:text-white"
            >
              En savoir plus
            </a>
          </div>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section
        id="fonctionnalites"
        className="border-t border-white/10 bg-[#050508] px-4 py-20"
      >
        <div className="mx-auto max-w-5xl">
          <p className="m-0 mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#60d7cf]">
            Fonctionnalités
          </p>
          <h2 className="m-0 mb-10 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
            Le pilotage publicitaire, sans les allers-retours
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20"
              >
                <h3 className="m-0 mb-2 text-base font-semibold text-white">
                  {f.title}
                </h3>
                <p className="m-0 text-sm leading-relaxed text-white/55">
                  {f.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pied de page landing */}
      <footer className="border-t border-white/10 bg-[#050508] px-4 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 text-sm text-white/40 sm:flex-row">
          <p className="m-0">© 2026 Eleven Process</p>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.16em]">
            Tracify · Suivi des campagnes
          </p>
        </div>
      </footer>
    </div>
  )
}
