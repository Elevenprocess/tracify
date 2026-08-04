import { internalMutation } from './_generated/server'

// Données de maquette. À exécuter avec : npx convex run seed:run
// Vide les tables puis insère clients, stats quotidiennes, sources et prospects.

const CLIENTS = [
  {
    slug: 'ecoi',
    name: 'ECOI — Electro Concept OI',
    sector: 'Électricité générale',
    status: 'active' as const,
    activeCampaigns: 3,
  },
  {
    slug: 'habitat-confort',
    name: 'Habitat Confort',
    sector: 'Rénovation intérieure',
    status: 'active' as const,
    activeCampaigns: 2,
  },
  {
    slug: 'solaire-plus',
    name: 'Solaire Plus Réunion',
    sector: 'Photovoltaïque',
    status: 'paused' as const,
    activeCampaigns: 2,
  },
  {
    slug: 'piscines-horizon',
    name: 'Piscines Horizon',
    sector: 'Construction de piscines',
    status: 'ended' as const,
    activeCampaigns: 1,
  },
]

// Série globale sur 30 jours (06/07 → 04/08), répartie ensuite par client
const DAILY: Array<[string, number, number]> = [
  ['2026-07-06', 212, 5],
  ['2026-07-07', 231, 7],
  ['2026-07-08', 246, 6],
  ['2026-07-09', 238, 8],
  ['2026-07-10', 259, 9],
  ['2026-07-11', 274, 7],
  ['2026-07-12', 220, 4],
  ['2026-07-13', 205, 6],
  ['2026-07-14', 214, 5],
  ['2026-07-15', 236, 8],
  ['2026-07-16', 248, 9],
  ['2026-07-17', 262, 10],
  ['2026-07-18', 280, 8],
  ['2026-07-19', 226, 5],
  ['2026-07-20', 210, 6],
  ['2026-07-21', 232, 7],
  ['2026-07-22', 251, 9],
  ['2026-07-23', 244, 8],
  ['2026-07-24', 268, 11],
  ['2026-07-25', 285, 9],
  ['2026-07-26', 231, 6],
  ['2026-07-27', 217, 5],
  ['2026-07-28', 240, 8],
  ['2026-07-29', 255, 10],
  ['2026-07-30', 270, 9],
  ['2026-07-31', 289, 12],
  ['2026-08-01', 301, 11],
  ['2026-08-02', 242, 7],
  ['2026-08-03', 228, 8],
  ['2026-08-04', 194, 6],
]

// Parts de chaque client dans les totaux (le dernier récupère le reste)
const SPEND_SHARE: Record<string, number> = {
  ecoi: 0.37,
  'solaire-plus': 0.29,
  'habitat-confort': 0.21,
  'piscines-horizon': 0.13,
}
const LEADS_SHARE: Record<string, number> = {
  ecoi: 0.45,
  'solaire-plus': 0.27,
  'habitat-confort': 0.19,
  'piscines-horizon': 0.09,
}

const SOURCES: Record<string, Array<[string, number]>> = {
  ecoi: [
    ['Facebook', 58],
    ['Instagram', 24],
    ['Formulaire site', 14],
  ],
  'habitat-confort': [
    ['Facebook', 26],
    ['Instagram', 11],
    ['Formulaire site', 4],
  ],
  'solaire-plus': [
    ['Facebook', 34],
    ['Instagram', 13],
    ['Formulaire site', 11],
  ],
  'piscines-horizon': [
    ['Facebook', 12],
    ['Instagram', 7],
  ],
}

type SeedProspect = [string, string, string, string, string, string]
const PROSPECTS: Record<string, Array<SeedProspect>> = {
  ecoi: [
    [
      'Marie Payet',
      '0692 44 12 33',
      '2026-08-04',
      'Facebook',
      'Vidéo témoignage',
      'new',
    ],
    [
      'Jean-Yves Hoarau',
      '0693 55 08 71',
      '2026-08-03',
      'Instagram',
      'Carrousel avant/après',
      'contacted',
    ],
    [
      'Sylvie Grondin',
      '0692 71 39 04',
      '2026-08-03',
      'Facebook',
      'Image offre visite',
      'qualified',
    ],
    [
      'Patrick Técher',
      '0693 20 65 88',
      '2026-08-02',
      'Formulaire site',
      'Recherche Google',
      'contacted',
    ],
    [
      'Nadia Fontaine',
      '0692 88 54 10',
      '2026-08-01',
      'Facebook',
      'Vidéo témoignage',
      'qualified',
    ],
    [
      'Ludovic Rivière',
      '0693 47 92 26',
      '2026-07-31',
      'Instagram',
      'Story sondage',
      'lost',
    ],
    [
      'Corinne Lebon',
      '0692 15 77 42',
      '2026-07-30',
      'Facebook',
      'Image offre visite',
      'contacted',
    ],
    [
      'David Maillot',
      '0693 62 30 95',
      '2026-07-30',
      'Formulaire site',
      'Accès direct',
      'new',
    ],
  ],
  'habitat-confort': [
    [
      'Émilie Robert',
      '0692 33 21 60',
      '2026-08-03',
      'Facebook',
      'Carrousel réalisations',
      'new',
    ],
    [
      'Thierry Boyer',
      '0693 81 44 07',
      '2026-08-02',
      'Instagram',
      'Vidéo chantier',
      'contacted',
    ],
    [
      'Laurence Dijoux',
      '0692 59 66 18',
      '2026-08-01',
      'Facebook',
      'Image devis gratuit',
      'qualified',
    ],
  ],
  'solaire-plus': [
    [
      'Bruno Vienne',
      '0693 27 50 34',
      '2026-08-02',
      'Facebook',
      'Vidéo économies',
      'contacted',
    ],
    [
      'Sabrina Ah-Fat',
      '0692 90 13 78',
      '2026-08-01',
      'Formulaire site',
      'Recherche Google',
      'new',
    ],
    [
      'Michel Sautron',
      '0693 36 84 51',
      '2026-07-31',
      'Facebook',
      'Image simulation',
      'qualified',
    ],
  ],
  'piscines-horizon': [
    [
      'Vanessa Turpin',
      '0692 62 47 29',
      '2026-07-28',
      'Facebook',
      'Carrousel piscines',
      'lost',
    ],
    [
      'Olivier Nativel',
      '0693 14 72 90',
      '2026-07-26',
      'Instagram',
      'Vidéo drone',
      'contacted',
    ],
  ],
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of [
      'clients',
      'dailyStats',
      'sourceStats',
      'prospects',
    ] as const) {
      const rows = await ctx.db.query(table).collect()
      await Promise.all(rows.map((r) => ctx.db.delete(r._id)))
    }

    const now = '2026-08-04T12:00:00.000Z'

    for (const client of CLIENTS) {
      await ctx.db.insert('clients', { ...client, createdAt: now })
    }

    const slugs = CLIENTS.map((c) => c.slug)
    for (const [date, spend, leads] of DAILY) {
      let spendLeft = spend
      let leadsLeft = leads
      for (const [i, slug] of slugs.entries()) {
        const last = i === slugs.length - 1
        const s = last ? spendLeft : Math.round(spend * SPEND_SHARE[slug])
        const l = last ? leadsLeft : Math.round(leads * LEADS_SHARE[slug])
        spendLeft -= s
        leadsLeft -= l
        await ctx.db.insert('dailyStats', {
          clientSlug: slug,
          date,
          spend: s,
          leads: Math.max(0, l),
        })
      }
    }

    for (const [slug, entries] of Object.entries(SOURCES)) {
      for (const [source, count] of entries) {
        await ctx.db.insert('sourceStats', { clientSlug: slug, source, count })
      }
    }

    for (const [slug, entries] of Object.entries(PROSPECTS)) {
      for (const [name, phone, date, source, medium, status] of entries) {
        await ctx.db.insert('prospects', {
          clientSlug: slug,
          name,
          phone,
          date,
          source,
          medium,
          status: status as 'new' | 'contacted' | 'qualified' | 'lost',
          createdAt: now,
        })
      }
    }

    return 'seed ok'
  },
})
