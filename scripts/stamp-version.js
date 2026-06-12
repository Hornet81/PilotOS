#!/usr/bin/env node
/**
 * stamp-version.js — Sella la versión "running" en el build del frontend.
 *
 * Lee la versión objetivo del archivo VERSION (raíz del repo) y, en cada deploy,
 * escribe la fecha-hora real + hash de git en los sitios que el frontend lee:
 *
 *   1. version.json   → fuente de verdad de la versión "running" (con cache-busting)
 *   2. index.html     → <meta name="version" content="...">
 *   3. sw.js          → const APP_VERSION = '...'  (cambia el nombre del caché → busta cachés viejos)
 *
 * Uso:
 *   node scripts/stamp-version.js            (usa el contenido de VERSION)
 *   node scripts/stamp-version.js Beta.02    (sobreescribe VERSION y sella)
 *
 * Flujo de release: editar VERSION (o pasar arg) → node scripts/stamp-version.js → git add -A && commit && push
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'VERSION');
const VERSION_JSON = path.join(ROOT, 'version.json');
const INDEX_HTML = path.join(ROOT, 'index.html');
const SW_JS = path.join(ROOT, 'sw.js');

// 1. Versión objetivo: argumento o archivo VERSION
let version = (process.argv[2] || '').trim();
if (version) {
  fs.writeFileSync(VERSION_FILE, version + '\n');
} else {
  version = fs.readFileSync(VERSION_FILE, 'utf8').trim();
}
if (!version) {
  console.error('[stamp] ERROR: no hay versión (ni argumento ni archivo VERSION)');
  process.exit(1);
}

// Canal según prefijo: Beta.* → beta, resto (v1.0, etc.) → prod
const channel = /^beta/i.test(version) ? 'beta' : 'prod';

// 2. Fecha-hora de build (UTC, ISO, sin milisegundos) — formato crudo, se formatea en cliente
const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

// 3. Hash corto de git (si hay repo)
let commit = null;
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim() || null;
} catch (_) {
  commit = null;
}

// ── Escribir version.json ──
const versionData = { version, channel, builtAt, env: 'running', commit };
fs.writeFileSync(VERSION_JSON, JSON.stringify(versionData, null, 2) + '\n');

// ── Actualizar <meta name="version"> en index.html ──
let html = fs.readFileSync(INDEX_HTML, 'utf8');
const metaRe = /(<meta\s+name="version"\s+content=")[^"]*(">)/;
if (metaRe.test(html)) {
  html = html.replace(metaRe, `$1${version}$2`);
  fs.writeFileSync(INDEX_HTML, html);
} else {
  console.warn('[stamp] AVISO: no encontré <meta name="version"> en index.html');
}

// ── Actualizar const APP_VERSION en sw.js (cambia el nombre del caché) ──
let sw = fs.readFileSync(SW_JS, 'utf8');
const swRe = /const APP_VERSION(\s*)=(\s*)'[^']*';/;
if (swRe.test(sw)) {
  sw = sw.replace(swRe, `const APP_VERSION$1=$2'${version}';`);
  fs.writeFileSync(SW_JS, sw);
} else {
  console.warn("[stamp] AVISO: no encontré const APP_VERSION en sw.js");
}

console.log('[stamp] OK →', JSON.stringify(versionData));
