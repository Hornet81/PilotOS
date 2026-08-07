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
 *   node scripts/stamp-version.js            (AUTO: detecta la última Beta.N en git + origin y sella la siguiente libre)
 *   node scripts/stamp-version.js auto       (igual que sin argumento)
 *   node scripts/stamp-version.js Beta.99    (sella esa versión; ABORTA si ya existe en el historial)
 *   node scripts/stamp-version.js Beta.99 --force   (fuerza aunque exista — usar con cuidado)
 *
 * Evita duplicados entre sesiones en paralelo: antes de sellar hace `git fetch` y
 * escanea TODOS los commits (todas las ramas) + version.json/VERSION de origin/main.
 *
 * Flujo de release: node scripts/stamp-version.js → git add -A && commit && push
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

// ── Detectar números Beta YA usados (historial git + origin + locales) ──
// Evita duplicados cuando varias sesiones comparten el mismo checkout.
function detectUsedBetaNumbers() {
  const used = new Set();
  const add = (txt) => {
    if (!txt) return;
    const re = /Beta\.(\d+)/gi; let m;
    while ((m = re.exec(txt))) used.add(parseInt(m[1], 10));
  };
  // Best-effort: traer lo último de otras sesiones (no fatal si no hay red)
  try { execSync('git fetch --all -q', { cwd: ROOT, stdio: 'ignore' }); } catch (_) {}
  // Mensajes de TODOS los commits (todas las ramas)
  try { add(execSync('git log --all --format=%s', { cwd: ROOT }).toString()); } catch (_) {}
  // version.json / VERSION en origin/main (lo realmente desplegado por otras sesiones)
  for (const ref of ['origin/main:version.json', 'origin/main:VERSION']) {
    try { add(execSync(`git show ${ref}`, { cwd: ROOT }).toString()); } catch (_) {}
  }
  // Locales
  try { add(fs.readFileSync(VERSION_JSON, 'utf8')); } catch (_) {}
  try { add(fs.readFileSync(VERSION_FILE, 'utf8')); } catch (_) {}
  return used;
}

const FORCE = process.argv.includes('--force');
const RECOMMIT = process.argv.includes('--recommit');
let arg = (process.argv[2] || '').trim();
if (arg === '--force') arg = ''; // "node stamp --force" → auto forzado
if (arg === '--recommit') arg = '';

// ── Modo --recommit: re-sella SOLO el campo commit con el HEAD actual ──
// Uso tras el commit del cambio para que la home muestre el SHA real
// (un archivo estático no puede llevar el hash de su propio commit; este
//  segundo paso graba el SHA del commit que SÍ contiene el cambio).
// No bumpea versión ni cambia builtAt: reutiliza lo que ya hay en version.json.
if (RECOMMIT) {
  let head = null;
  try { head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim() || null; } catch (_) {}
  if (!head) { console.error('[stamp] ERROR --recommit: no pude leer HEAD'); process.exit(1); }

  const vj = JSON.parse(fs.readFileSync(VERSION_JSON, 'utf8'));
  vj.commit = head;
  fs.writeFileSync(VERSION_JSON, JSON.stringify(vj, null, 2) + '\n');

  let html2 = fs.readFileSync(INDEX_HTML, 'utf8');
  const winRe2 = /window\.__PILOTOS_VERSION__=\{[^}]*\};/;
  if (winRe2.test(html2)) {
    const embedded2 = JSON.stringify({ version: vj.version, builtAt: vj.builtAt, commit: head, channel: vj.channel });
    html2 = html2.replace(winRe2, `window.__PILOTOS_VERSION__=${embedded2};`);
    fs.writeFileSync(INDEX_HTML, html2);
  } else {
    console.warn('[stamp] AVISO --recommit: no encontré window.__PILOTOS_VERSION__ en index.html');
  }
  console.log('[stamp] RECOMMIT OK →', JSON.stringify({ version: vj.version, builtAt: vj.builtAt, commit: head }));
  process.exit(0);
}

const usedBeta = detectUsedBetaNumbers();
const maxUsed = usedBeta.size ? Math.max.apply(null, Array.from(usedBeta)) : 0;

// 1. Versión objetivo
let version;
if (!arg || /^(auto|next)$/i.test(arg)) {
  version = 'Beta.' + (maxUsed + 1);
  console.log(`[stamp] AUTO → última detectada Beta.${maxUsed}, sello ${version}`);
} else {
  version = arg;
  const mm = version.match(/^Beta\.(\d+)$/i);
  if (mm) {
    const n = parseInt(mm[1], 10);
    if (usedBeta.has(n) && !FORCE) {
      console.error(`[stamp] ERROR: ${version} YA existe en el historial (máx detectada: Beta.${maxUsed}).`);
      console.error(`[stamp]        Ejecuta sin argumento para auto (→ Beta.${maxUsed + 1}) o añade --force para forzar.`);
      process.exit(1);
    }
  }
}
fs.writeFileSync(VERSION_FILE, version + '\n');

// Canal: este repo ES producción (pilotos.aero), así que SIEMPRE 'stable'. No se deduce del
// prefijo de la versión — la beta vive en OTRO repo (pilotos-backend, rama `beta`, servida por
// Railway) y se sella aparte.
// ⚠️ Antes era `/^beta/i.test(version) ? 'beta' : 'prod'`, y eso fallaba por los dos lados:
//   · Con "Beta.NNN" —que es como se numera SIEMPRE, también en producción— escribía
//     channel:"beta", así que la etiqueta bajo el logo decía "beta" a los pilotos de PROD. Había
//     que acordarse de corregirlo A MANO en cada promoción; se coló en Beta.454 y Beta.455.
//   · El otro valor posible, 'prod', tampoco servía: pilotosChannelLabel() sólo entiende 'stable'
//     y 'beta'; cualquier otra cosa deja la etiqueta del canal VACÍA.
const channel = 'stable';

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

// ── Actualizar index.html: <meta> + window.__PILOTOS_VERSION__ ──
let html = fs.readFileSync(INDEX_HTML, 'utf8');
let htmlChanged = false;

const metaRe = /(<meta\s+name="version"\s+content=")[^"]*(">)/;
if (metaRe.test(html)) {
  html = html.replace(metaRe, `$1${version}$2`);
  htmlChanged = true;
} else {
  console.warn('[stamp] AVISO: no encontré <meta name="version"> en index.html');
}

// Versión embebida = lo que ESTE HTML ejecuta (la lee el widget como "running")
const embedded = JSON.stringify({ version, builtAt, commit, channel });
const winRe = /window\.__PILOTOS_VERSION__=\{[^}]*\};/;
if (winRe.test(html)) {
  html = html.replace(winRe, `window.__PILOTOS_VERSION__=${embedded};`);
  htmlChanged = true;
} else {
  console.warn('[stamp] AVISO: no encontré window.__PILOTOS_VERSION__ en index.html');
}

if (htmlChanged) fs.writeFileSync(INDEX_HTML, html);

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
