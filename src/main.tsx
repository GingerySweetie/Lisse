import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './lib/storage-persist'

// Ask the WebView/browser to keep IndexedDB under storage pressure.
// Fire-and-forget: never block first paint on the permission prompt.
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
