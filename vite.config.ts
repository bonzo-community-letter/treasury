/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The page is static and its reach is exactly the policy below: the two public
 * mirror nodes and CoinGecko (both answer with CORS `*`, verified live), the
 * WalletConnect relay on both official domains, the WalletConnect explorer
 * API the connector uses to list and deep-link wallets, and HashPack's site
 * for its connect deep link. The frame allowance exists only for
 * WalletConnect's verification iframe. No inline script, no inline style,
 * nowhere to send anything else.
 *
 * Dev widens two lines and nothing else: React Fast Refresh injects a small
 * inline module preamble, and Vite's HMR client needs a loopback websocket.
 */
const cspCommon = [
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https://mainnet-public.mirrornode.hedera.com https://testnet.mirrornode.hedera.com https://api.coingecko.com wss://relay.walletconnect.com wss://relay.walletconnect.org https://relay.walletconnect.com https://relay.walletconnect.org https://explorer-api.walletconnect.com wss://*.walletconnect.com wss://*.walletconnect.org https://hashpack.app https://www.hashpack.app",
  'frame-src https://verify.walletconnect.com https://verify.walletconnect.org',
  'worker-src blob:',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
]

const cspProduction = ["default-src 'none'", "script-src 'self'", "style-src 'self'", ...cspCommon].join('; ')

const cspDev = [
  "default-src 'none'",
  // React Fast Refresh injects a small inline module preamble
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self'",
  // Vite's HMR client connects over a loopback websocket
  "connect-src 'self' ws: https://mainnet-public.mirrornode.hedera.com https://testnet.mirrornode.hedera.com https://api.coingecko.com wss://relay.walletconnect.com wss://relay.walletconnect.org https://relay.walletconnect.com https://relay.walletconnect.org https://explorer-api.walletconnect.com wss://*.walletconnect.com wss://*.walletconnect.org https://hashpack.app https://www.hashpack.app",
  'frame-src https://verify.walletconnect.com https://verify.walletconnect.org',
  'worker-src blob:',
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

// Served under /treasury/ on the user-site domain via project Pages; the
// relative base is what makes that work with no rebuild. VITE_BASE=/ restores
// absolute asset paths for a root-served deploy.
const base = process.env.VITE_BASE?.trim() || './'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), cspPlugin()],
  server: {
    // the loopback-only discipline this family of tools keeps (as in the
    // treasury console): a wallet page reachable from the LAN is how a
    // rehearsal page becomes a phishing page. No DEV_BIND_HOST escape hatch.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
