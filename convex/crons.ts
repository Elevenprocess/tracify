import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Resync Meta de toutes les campagnes rattachées, toutes les 6 heures.
crons.interval('sync meta campaigns', { hours: 6 }, internal.meta.syncAll, {})

export default crons
