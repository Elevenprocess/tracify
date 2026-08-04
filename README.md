# Tracify

Plateforme Eleven Process de suivi des campagnes publicitaires clients :
tableau de bord global (KPI Dépense / Prospects / CPL, courbes 30 jours,
table clients) et fiche détaillée par client (prospects hebdo, répartition
par source, derniers prospects).

## Stack

- [TanStack Start](https://tanstack.com/start) (React 19, TanStack Router, Vite)
- [Convex](https://convex.dev) — base de données temps réel (projet `erwan-felix/tracify`)
- Tailwind CSS 4
- Graphiques SVG maison (`src/components/charts/`)

## Démarrer

```bash
npm install
npx convex dev --once   # pousse schéma + fonctions sur le déploiement dev
npm run dev             # http://localhost:3000
```

Variables d'environnement dans `.env.local` (non versionné) :
`CONVEX_DEPLOYMENT` et `VITE_CONVEX_URL`.

## Données de démo

Le seed de la maquette insère 4 clients avec stats, sources et prospects :

```bash
npx convex run seed:run
```

## Organisation

- `convex/schema.ts` — tables `clients`, `dailyStats`, `sourceStats`, `prospects`
- `convex/dashboard.ts` — queries `overview` (vue d'ensemble) et `client` (détail)
- `convex/seed.ts` — données de maquette
- `src/routes/index.tsx` — tableau de bord
- `src/routes/clients.$clientId.tsx` — détail client
- `src/lib/format.ts` — formatteurs fr-FR (€, nombres, dates)

## Scripts

```bash
npm run lint     # eslint
npm run format   # prettier + eslint --fix
npm run build    # build de production
```
