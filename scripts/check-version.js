#!/usr/bin/env node
/**
 * check-version.js — Muestra, ANTES de desplegar, qué versión tienes en local
 * frente a la que está publicada en producción (frontend + backend).
 *
 * Uso:  node scripts/check-version.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');

function readLocal() {
  let v = '(sin VERSION)';
  try { v = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(); } catch (_) {}
  let j = null;
  try { j = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')); } catch (_) {}
  return { v, j };
}

// Fetch JSON con https (funciona en cualquier versión de Node)
function getJson(url) {
  return new Promise(function (resolve) {
    const req = https.get(url, { timeout: 9000, headers: { 'Cache-Control': 'no-store' } }, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ error: 'respuesta no-JSON (HTTP ' + res.statusCode + ')' }); }
      });
    });
    req.on('error', function (e) { resolve({ error: e.message }); });
    req.on('timeout', function () { req.destroy(); resolve({ error: 'timeout' }); });
  });
}

(async function () {
  const local = readLocal();
  const fe = await getJson('https://pilotos.aero/version.json?t=' + Date.now());
  const be = await getJson('https://api.pilotos.aero/api/version');

  console.log('');
  console.log('── VERSIÓN ─────────────────────────────────────────');
  console.log('LOCAL (lo que tienes, aún sin desplegar):');
  console.log('  VERSION file : ' + local.v);
  if (local.j) console.log('  version.json : ' + local.j.version + '  (' + (local.j.builtAt || '?') + ' · ' + (local.j.commit || 'sin commit') + ')');
  console.log('');
  console.log('PRODUCCIÓN (lo que ven los dispositivos ahora):');
  console.log('  Frontend pilotos.aero      : ' + (fe.error ? '⚠️ ' + fe.error : fe.version + '  (' + (fe.builtAt || '?') + ')'));
  console.log('  Backend  api.pilotos.aero  : ' + (be.error ? '⚠️ ' + be.error : be.version + ' · ' + (be.env || '?')));
  console.log('────────────────────────────────────────────────────');

  if (!fe.error && local.v && local.v !== '(sin VERSION)') {
    if (fe.version === local.v) {
      console.log('ℹ️  Tu VERSION local = la publicada. Si vas a desplegar cambios, SUBE el número primero:');
      console.log('    node scripts/stamp-version.js ' + nextGuess(local.v));
    } else {
      console.log('ℹ️  Tu VERSION local (' + local.v + ') ≠ publicada (' + fe.version + '). Al desplegar, producción pasará a ' + local.v + '.');
    }
  }
  console.log('');
})();

// Sugiere el siguiente número (Beta.01 → Beta.02)
function nextGuess(v) {
  const m = v.match(/^(.*?)(\d+)$/);
  if (!m) return v;
  const n = (parseInt(m[2], 10) + 1).toString().padStart(m[2].length, '0');
  return m[1] + n;
}
