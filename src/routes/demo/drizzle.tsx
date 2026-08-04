import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/demo/drizzle')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})
