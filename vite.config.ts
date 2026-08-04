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
      routeRules: {
        '/': { swr: 300 },
        '/dashboard': { swr: 60 },
        '/clients/**': { swr: 60 },
        '/campagnes/**': { swr: 60 },
      },
    }),
    viteReact(),
  ],
})

export default config
