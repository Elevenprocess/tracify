import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    nitroV2Plugin({
      preset: 'vercel',
      // Cache en périphérie (ISR) : la page est servie instantanément depuis
      // le CDN et se régénère en arrière-plan ; le websocket Convex rafraîchit
      // de toute façon les chiffres en direct après l'affichage.
      // « isr » (natif Vercel) et non « swr » : le swr passe par le cache
      // interne de Nitro, qui ne sait pas sérialiser la réponse SSR streamée
      // et sert `{}` à partir de la deuxième requête.
      routeRules: {
        '/': { isr: { expiration: 300 } },
        '/dashboard': { isr: { expiration: 60 } },
        '/clients/**': { isr: { expiration: 60 } },
        '/campagnes/**': { isr: { expiration: 60 } },
      },
    }),
    viteReact(),
  ],
})

export default config
