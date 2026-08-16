import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { auth } from './auth'
import { receive } from './leads'

const http = httpRouter()
auth.addHttpRoutes(http)

// Webhook d'entrée des leads (clé par client, voir convex/leads.ts).
http.route({ path: '/api/leads', method: 'POST', handler: receive })
http.route({
  path: '/api/leads',
  method: 'OPTIONS',
  handler: httpAction(
    async () =>
      new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
        },
      }),
  ),
})

export default http
