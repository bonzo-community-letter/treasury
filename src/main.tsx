import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// The Hiero SDK was written for Node as well as the browser; `buffer` is its one
// runtime polyfill. Guarded: where a Buffer already exists, nothing is replaced.
// (Buffer is a utility for the SDK, not secret storage — keys live in React state.)
if (typeof globalThis.Buffer === 'undefined') {
  const { Buffer } = await import('buffer')
  globalThis.Buffer = Buffer
}

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
