# PilotOS — Frontend (pilotos.aero)

App de un solo archivo (`index.html`) servida por GitHub Pages.

## Sistema de versión / actualización PWA

Dos cosas separadas, sin números cruzados:

1. **¿Hay versión nueva? → lo decide el Service Worker.** Cuando detecta código nuevo, queda un SW "en espera" y el widget muestra *"⚠️ Hay una nueva versión · Actualizar"*. No compara números ni depende del backend.
2. **¿Qué versión soy? → una etiqueta para humanos.** Un único número (frontend), solo para mostrar/reportar bugs.

Piezas:

- **`VERSION`** — versión objetivo (ej. `Beta.01`). El número solo sube en deploy, no en cada guardado.
- **`scripts/stamp-version.js`** — sella en el build: actualiza `<meta name="version">` y `window.__PILOTOS_VERSION__` (la versión que ESE HTML ejecuta) en `index.html`, `const APP_VERSION` en `sw.js`, y genera `version.json` (para `check-version.js`). Incluye fecha-hora UTC + hash git.
- **`sw.js`** — Service Worker network-first para HTML (nunca cachea `/api/*` ni `version.json`), con `skipWaiting` + `clients.claim`, handler `SKIP_WAITING` y caché versionado por `APP_VERSION`. Esto es lo que arregla el iPad congelado.
- El widget aparece en login, home y menú de usuario; lee `window.__PILOTOS_VERSION__` para la etiqueta y `window.__pilotosUpdateReady` (lo pone el SW) para el aviso de actualización.

## Antes de desplegar: ¿cuál es la última versión?

```bash
node scripts/check-version.js
```
Muestra tu versión local (`VERSION` + `version.json`) frente a la publicada en producción
(frontend `pilotos.aero` + backend `api.pilotos.aero`), y sugiere el siguiente número.

## Cómo subir de versión y desplegar

```bash
# 0. (opcional) comprobar qué hay publicado ahora
node scripts/check-version.js

# 1. Editar la versión objetivo (o pasarla como argumento al stamp)
echo "Beta.02" > VERSION

# 2. Sellar el build (genera version.json + actualiza meta y sw.js)
node scripts/stamp-version.js
#    alternativa en una línea: node scripts/stamp-version.js Beta.02

# 3. Desplegar a GitHub Pages
git add index.html sw.js VERSION version.json
git commit -m "Deploy Beta.02"
git push
```

> El widget **no** depende del backend, así que un deploy solo-frontend no requiere tocar Railway. El backend mantiene `GET /api/version` (env `APP_VERSION`, fallback `Beta.01`) solo como dato informativo para `check-version.js`.
