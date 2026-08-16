import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvex, useConvexAuth } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '../../convex/_generated/api'
import { TRACKING_CODE_KEY, normalizeTrackingCode } from '../lib/trackingCode'
import { EyeIcon, KeyIcon } from '../components/icons'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { isAuthenticated } = useConvexAuth()
  const { signIn } = useAuthActions()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" />
  }

  const onGoogle = async () => {
    setPending(true)
    setError(null)
    try {
      await signIn('google', { redirectTo: '/dashboard' })
    } catch {
      setError('Connexion impossible. Réessaie ou contacte Mario.')
      setPending(false)
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
      <div className="rise-in mb-8 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--lagoon-line)] bg-[var(--lagoon-tint)]">
          <span className="h-3 w-3 rounded-full bg-[var(--lagoon)] shadow-[0_0_18px_var(--lagoon)]" />
        </span>
        <h1 className="m-0 text-2xl font-extrabold tracking-tight text-[var(--sea-ink)] sm:text-3xl">
          Bienvenue sur Tracify
        </h1>
        <p className="m-0 mt-2 text-sm text-[var(--sea-ink-soft)]">
          Le suivi des campagnes publicitaires d'Eleven Process.
        </p>
      </div>

      <div className="rise-in grid w-full max-w-3xl gap-4 md:grid-cols-2">
        <section className="island-shell flex flex-col rounded-2xl p-6 sm:p-7">
          <span className="icon-chip mb-4">
            <KeyIcon className="h-4 w-4" />
          </span>
          <h2 className="m-0 text-lg font-bold tracking-tight text-[var(--sea-ink)]">
            Équipe Eleven Process
          </h2>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-[var(--sea-ink-soft)]">
            Accès au tableau de bord complet : clients, campagnes, créatives et
            prospects.
          </p>

          <button
            type="button"
            onClick={onGoogle}
            disabled={pending}
            className="mt-auto flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-transparent bg-white px-4 py-2.5 pt-2.5 text-sm font-bold text-black transition-colors hover:bg-[#eef3f3] disabled:opacity-60 [margin-top:1.5rem]"
          >
            <GoogleIcon />
            {pending ? 'Redirection…' : 'Se connecter avec Google'}
          </button>

          {error && (
            <p className="m-0 mt-3 text-sm text-[var(--status-warn)]">
              {error}
            </p>
          )}
        </section>

        <TrackingCodeCard />
      </div>
    </main>
  )
}

// Accès client par code : le code généré sur la page campagne ouvre le suivi
// public de la publicité, sans compte Google.
function TrackingCodeCard() {
  const convex = useConvex()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const cleaned = normalizeTrackingCode(code)
    if (!cleaned) return
    setChecking(true)
    setError(null)
    try {
      const valid = await convex.query(api.access.check, { code: cleaned })
      if (valid) {
        localStorage.setItem(TRACKING_CODE_KEY, cleaned)
        navigate({ to: '/suivi' })
      } else {
        setError('Code invalide ou désactivé. Vérifie auprès de ton contact.')
      }
    } catch {
      setError('Vérification impossible. Réessaie dans un instant.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <section className="island-shell flex flex-col rounded-2xl p-6 sm:p-7">
      <span className="icon-chip mb-4">
        <EyeIcon className="h-4 w-4" />
      </span>
      <h2 className="m-0 text-lg font-bold tracking-tight text-[var(--sea-ink)]">
        Suivre ma publicité
      </h2>
      <p className="m-0 mt-1.5 text-sm leading-relaxed text-[var(--sea-ink-soft)]">
        Vous avez reçu un code de suivi ? Saisissez-le pour voir les résultats
        de votre campagne et vos prospects.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-6 flex gap-2 [margin-top:auto] [padding-top:1.5rem]"
      >
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Ex. K7F2QM"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          aria-label="Code de suivi"
          className="field flex-1 py-2.5 text-center font-mono text-sm font-bold uppercase tracking-[0.25em]"
        />
        <button
          type="submit"
          disabled={checking || normalizeTrackingCode(code).length === 0}
          className="btn btn-primary"
        >
          {checking ? '…' : 'Voir'}
        </button>
      </form>

      {error && (
        <p className="m-0 mt-3 text-sm text-[var(--status-warn)]">{error}</p>
      )}
    </section>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.21 7.21 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A12 12 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  )
}
