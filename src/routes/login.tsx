import { useState } from 'react'
import { Navigate, createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'

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
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
        <p className="island-kicker m-0 mb-1">Tracify</p>
        <h1 className="m-0 text-2xl font-bold tracking-tight text-[var(--sea-ink)]">
          Connexion
        </h1>
        <p className="m-0 mt-2 text-sm text-[var(--sea-ink-soft)]">
          Accès réservé à l'équipe Eleven Process.
        </p>

        <button
          type="button"
          onClick={onGoogle}
          disabled={pending}
          className="mt-6 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-bold text-black disabled:opacity-60"
        >
          <GoogleIcon />
          {pending ? 'Redirection…' : 'Se connecter avec Google'}
        </button>

        {error && (
          <p className="m-0 mt-4 text-sm text-[var(--status-warn)]">{error}</p>
        )}
      </div>
    </main>
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
