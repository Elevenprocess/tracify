import { Link, createFileRoute } from '@tanstack/react-router'
import Prism from '../components/Prism/Prism'
import BlurText from '../components/BlurText'

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
      <section className="relative h-svh w-full overflow-hidden">
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
                className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-black no-underline transition-transform hover:-translate-y-0.5 sm:px-4"
              >
                <span className="hidden sm:inline">Ouvrir le dashboard</span>
                <span className="sm:hidden">Dashboard</span>
              </Link>
            </div>
          </div>
        </nav>

        {/* Contenu du hero — laisse passer le clic maintenu vers l'animation */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-4 text-center">
          <BlurText
            text="Toutes vos campagnes clients. Une seule plateforme."
            delay={200}
            animateBy="words"
            direction="top"
            className="m-0 max-w-3xl justify-center text-[clamp(1.75rem,4vw+1rem,3.75rem)] font-bold leading-[1.08] tracking-tight"
          />
          <p className="mt-4 max-w-xl text-[clamp(0.9375rem,1vw+0.6rem,1.125rem)] text-white/60 sm:mt-5">
            Tracify centralise la dépense publicitaire, les prospects et la
            performance de chaque client Eleven Process — en direct.
          </p>
          {/* Sur téléphone, les deux boutons sont ancrés en bas de l'écran ;
              sur desktop ils restent sous le texte. */}
          <div className="pointer-events-auto absolute inset-x-4 bottom-8 mx-auto flex max-w-xs flex-col items-stretch justify-center gap-3 sm:static sm:mt-8 sm:w-auto sm:max-w-none sm:flex-row sm:items-center">
            <Link
              to="/dashboard"
              className="rounded-xl bg-white px-6 py-3 text-center text-sm font-bold text-black no-underline transition-transform hover:-translate-y-0.5"
            >
              Accéder au tableau de bord
            </Link>
            <a
              href="#fonctionnalites"
              className="rounded-xl border border-white/15 bg-white/[0.06] px-6 py-3 text-center text-sm font-semibold text-white/80 no-underline backdrop-blur-md transition-colors hover:bg-white/[0.12] hover:text-white"
            >
              En savoir plus
            </a>
          </div>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section
        id="fonctionnalites"
        className="border-t border-white/10 bg-[#050508] px-4 py-14 sm:px-6 sm:py-20"
      >
        <div className="mx-auto max-w-5xl">
          <p className="m-0 mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#60d7cf]">
            Fonctionnalités
          </p>
          <h2 className="m-0 mb-8 max-w-xl text-[clamp(1.375rem,2vw+0.75rem,1.875rem)] font-bold tracking-tight sm:mb-10">
            Le pilotage publicitaire, sans les allers-retours
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20 sm:p-6"
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
