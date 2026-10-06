import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite does not read PORT on its own. Honouring it lets the harness assign a
// free port instead of colliding with whatever already holds Vite's default.
const port = process.env.PORT ? Number(process.env.PORT) : undefined

/** GitHub Pages serves a project site under /<repo>/, so built asset URLs need it. */
export const SITE_BASE = '/halloween-costume-voting/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? SITE_BASE : '/',
  plugins: [react()],
  server: { port },
}))
