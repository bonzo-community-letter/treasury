import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The page must never reach the network at runtime. The CSP meta tag carries that
 * promise to the browser, and it differs between the two modes for one reason only:
 * the dev server's hot reload needs a websocket and the React plugin's refresh
 * preamble is inline. The built page allows neither.
 */
const cspProduction = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const cspDev = [
  "default-src 'none'",
  // React Fast Refresh injects a small inline module preamble
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  // Vite's HMR client connects over a loopback websocket
  "connect-src 'self' ws:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function cspPlugin(): Plugin {
  let dev = false
  return {
    name: 'csp',
    configResolved(config) {
      dev = config.command === 'serve'
    },
    transformIndexHtml(html) {
      return html.replace('__CSP__', dev ? cspDev : cspProduction)
    },
  }
}

// Optional network exposure for the dev server, as in the open-letter repo. All unset
// by default: the ceremony runs on loopback, and nothing about one machine's network
// lives in the code.
//
//   DEV_BIND_HOST     interface to listen on (default 127.0.0.1)
//   PUBLIC_DEV_HOST   hostname clients use (Vite blocks unknown Host headers)
const devBindHost = process.env.DEV_BIND_HOST?.trim() || '127.0.0.1'
const publicDevHost = process.env.PUBLIC_DEV_HOST?.trim() || undefined
const allowedHosts = publicDevHost ? [publicDevHost] : []

// This tool is a local file: the build can be opened from any path. VITE_BASE=/ keeps
// absolute asset paths; a relative base lets the dist folder sit anywhere.
const base = process.env.VITE_BASE?.trim() || '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), cspPlugin()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: devBindHost,
    port: 5173,
    strictPort: true,
    allowedHosts,
  },
  preview: {
    host: devBindHost,
    port: 4173,
    strictPort: true,
    allowedHosts,
  },
})
