# PilotOS — Frontend (pilotos.aero)

App de un solo archivo (`index.html`) servida por GitHub Pages.

## Sistema de versión / actualización PWA

- **`VERSION`** — versión objetivo (ej. `Beta.01`). El número solo sube en deploy, no en cada guardado.
- **`scripts/stamp-version.js`** — sella la versión en el build: genera `version.json` (con fecha-hora UTC + hash git), y actualiza `<meta name="version">` en `index.html` y `const APP_VERSION` en `sw.js`.
- **`version.json`** — fuente de verdad de la versión "running"; el frontend la lee con cache-busting (`?t=`).
- **`sw.js`** — Service Worker network-first para HTML (nunca cachea `/api/*` ni `version.json`), con `skipWaiting` + `clients.claim` y caché versionado por `APP_VERSION`.
- El widget de versión aparece en el login (pie de la tarjeta) y en el menú de usuario dentro de la app; compara running (dispositivo) vs published (`GET /api/version` del backend) y ofrece botón **Actualizar** si hay desfase.

## Cómo subir de versión y desplegar

```bash
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

> El backend (`api.pilotos.aero`, repo `pilotos-backend`) reporta su versión vía la variable de entorno `APP_VERSION` en Railway (fallback `Beta.01`). Para que el "Server" del widget coincida, actualizar `APP_VERSION` en Railway al mismo número en cada release de backend.
