import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Resync Meta de toutes les campagnes rattachées, toutes les 6 heures.
crons.interval('sync meta campaigns', { hours: 6 }, internal.meta.syncAll, {})

// Garde la fonction Vercel chaude (démarrage à froid ≈ 8 s sinon).
crons.interval('keep vercel warm', { minutes: 5 }, internal.meta.keepWarm, {})

export default crons
