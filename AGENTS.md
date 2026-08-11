# AGENTS.md

## Cursor Cloud specific instructions

Lisse / Wisteria is a **client-side PWA** (React 19 + Vite 8 + TypeScript, pnpm). There is **no backend server in this repo** — everything runs in the browser and all data persists in IndexedDB (Dexie). It can also be packaged as a native Android app via Capacitor.

### Services / commands
The only in-repo service is the Vite dev server. Standard commands live in `package.json` and `README.md`:
- Dev server: `pnpm dev` → http://localhost:5173
- Build: `pnpm build` (`tsc -b && vite build`)
- Lint: `pnpm lint`
- Preview built output: `pnpm preview`

### Non-obvious notes
- **`pnpm lint` currently reports pre-existing errors on `main`** (react-hooks/set-state-in-effect and similar). These are not caused by environment setup; don't assume you broke something. `pnpm build` and `pnpm dev` succeed regardless.
- **No env vars / API keys at build time.** LLM/embedding/MCP/music endpoints are all external and configured at runtime in the app's Settings (设置 · Endpoints) UI, stored in IndexedDB. Providers must be CORS-enabled since calls go directly from the browser.
- **To test chat end-to-end without a real provider**, run a local OpenAI-compatible SSE mock and add it as an endpoint. The OpenAI client posts to `{baseUrl}/chat/completions` (see `src/api/openai.ts`), expecting standard OpenAI streaming chunks (`choices[0].delta.content`) terminated by `data: [DONE]`. Configure it in Settings with format "OpenAI 兼容" and auth "Bearer". Serve `Access-Control-Allow-Origin: *` and handle the OPTIONS preflight.
- **Android/Capacitor** builds (optional, not needed for web dev) require Java 21 + Android SDK; `scripts/cap-postsync.sh` runs after `npx cap sync android` to inject native plugins. See `.github/workflows/android.yml`.
