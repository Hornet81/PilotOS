/* admin-testers.js — la señal de actividad de la app y el panel de beta testers.
 *
 * · Actividad: con sesión, la app avisa de que está abierta (al arrancar y al volver
 *   del segundo plano, como mucho cada 30 min). Va PRIMERO a su propio origen: en beta
 *   es el backend de beta, que tiene la ruta; el configurado (producción) va detrás.
 *   Medirlo en el servidor por las peticiones no vale: la app de beta llama a
 *   producción para casi todo.
 *
 * · Panel: «Beta testers» en el menú del avatar, sólo para las cuentas de ADMIN.
 *   Enseñar la entrada es cosa del cliente; QUIÉN puede leer la lista lo decide el
 *   servidor (/api/admin/testers responde 403 a cualquier otra cuenta).
 *
 * El panel es una herramienta de administración en castellano (translate="no") y con
 * UNA sola paleta: el fondo es opaco y oscuro en los dos temas.
 */
(function () {
  'use strict';
  var ADMIN = ['alexbalcells2000@yahoo.es'];
  var ACT_KEY = 'pilotos_act_ult';
  var ACT_CADA = 30 * 60000;

  function token() {
    try { var t = localStorage.getItem('cafi_auth_token') || ''; return t && t !== 'demo-bypass-token' ? t : ''; } catch (e) { return ''; }
  }
  function usuario() {
    try { return JSON.parse(localStorage.getItem('cafi_auth_user') || 'null') || {}; } catch (e) { return {}; }
  }
  function esAdmin() {
    var e = String(usuario().email || '').toLowerCase();
    return !!e && ADMIN.indexOf(e) >= 0;
  }
  function origenes() {
    var o = [];
    try { if (/^https?:/.test(location.origin)) o.push(location.origin); } catch (e) {}
    var b = '';
    try { b = typeof window.ldBackendUrl === 'function' ? window.ldBackendUrl() : (localStorage.getItem('cafi_backend_url') || 'https://api.pilotos.aero'); } catch (e) {}
    b = String(b || '').replace(/\/+$/, '');
    if (b && o.indexOf(b) < 0) o.push(b);
    return o;
  }
  // Prueba los orígenes en orden y devuelve la primera respuesta que no sea 404/405
  // (una ruta que ese servidor aún no tiene).
  function pide(ruta, opt) {
    var os = origenes(), i = 0;
    function sig(ult) {
      if (i >= os.length) return ult ? Promise.resolve(ult) : Promise.reject(new Error('sin_red'));
      var o = os[i++];
      return fetch(o + ruta, opt).then(function (r) {
        if ((r.status === 404 || r.status === 405) && i < os.length) return sig(r);
        return r;
      }, function (e) { return i < os.length ? sig(ult) : Promise.reject(e); });
    }
    return sig(null);
  }

  // ── Actividad ───────────────────────────────────────────────────────────
  var _enCurso = false;
  function marca(forzar) {
    var t = token(), u = usuario();
    if (!t || !u.id || _enCurso) return;
    var clave = ACT_KEY + ':' + u.id, ult = 0;
    try { ult = +localStorage.getItem(clave) || 0; } catch (e) {}
    if (!forzar && Date.now() - ult < ACT_CADA) return;
    _enCurso = true;
    pide('/api/actividad', { method: 'POST', headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { if (r && r.ok) { try { localStorage.setItem(clave, String(Date.now())); } catch (e) {} } })
      .catch(function () {})
      .then(function () { _enCurso = false; });
  }
  window.pilotosMarcaActividad = marca;
  setTimeout(function () { marca(); }, 3000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') marca(); });
  // Tras entrar por la reja no hay recarga: el token aparece después.
  window.addEventListener('storage', function (e) { if (e.key === 'cafi_auth_token') marca(); });
  setInterval(function () { if (document.visibilityState === 'visible') marca(); }, 5 * 60000);

  // ── Entrada del menú ────────────────────────────────────────────────────
  function gate() {
    var it = document.getElementById('pp-admin');
    // En la build estable (pilotos.aero) no hay panel de testers: es cosa de beta.
    var v = window.__PILOTOS_VERSION__, beta = !v || !v.channel || v.channel === 'beta';
    if (it) it.hidden = !esAdmin() || !beta;
  }
  window.admTestersGate = gate;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', gate); else gate();
  setInterval(gate, 4000);   // la sesión cambia sin recargar (entrar, cerrar sesión)

  // ── Panel ───────────────────────────────────────────────────────────────
  var CSS = [
    '#adm-tst{position:fixed;inset:0;z-index:10050;background:rgba(2,6,16,.72);display:flex;align-items:flex-end;justify-content:center}',
    '#adm-tst .at-p{background:#0B1220;color:#E2E8F0;width:100%;max-width:640px;max-height:92vh;border-radius:20px 20px 0 0;border:1px solid #1E293B;display:flex;flex-direction:column;font-family:inherit}',
    '#adm-tst .at-h{display:flex;align-items:center;gap:10px;padding:16px 16px 10px}',
    '#adm-tst .at-t{font-size:17px;font-weight:800;color:#F8FAFC;flex:1}',
    '#adm-tst .at-x{width:44px;height:44px;border-radius:12px;border:1px solid #334155;background:#111A2C;color:#E2E8F0;font-size:18px;cursor:pointer}',
    '#adm-tst .at-b{overflow-y:auto;padding:0 16px 24px;-webkit-overflow-scrolling:touch}',
    '#adm-tst .at-sum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:4px 0 10px}',
    '#adm-tst .at-k{background:#111A2C;border:1px solid #1E293B;border-radius:12px;padding:9px 6px;text-align:center}',
    '#adm-tst .at-kn{font-size:20px;font-weight:800;color:#F8FAFC}',
    '#adm-tst .at-kl{font-size:10.5px;color:#A5B4C8;margin-top:2px;line-height:1.2}',
    '#adm-tst .at-regla{font-size:11.5px;color:#A5B4C8;line-height:1.45;margin:0 0 12px}',
    '#adm-tst .at-sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#A5B4C8;margin:14px 0 6px}',
    '#adm-tst .at-c{background:#111A2C;border:1px solid #1E293B;border-left:4px solid var(--c,#475569);border-radius:12px;padding:10px 12px;margin-bottom:8px}',
    '#adm-tst .at-n{display:flex;align-items:center;gap:8px}',
    '#adm-tst .at-nm{font-size:14px;font-weight:700;color:#F8FAFC;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#adm-tst .at-st{font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:999px;background:var(--c,#475569);color:#0B1220;white-space:nowrap}',
    '#adm-tst .at-em{font-size:11.5px;color:#A5B4C8;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#adm-tst .at-l{font-size:12px;color:#CBD5E1;margin-top:6px;line-height:1.45}',
    '#adm-tst .at-l b{color:#F8FAFC}',
    '#adm-tst .at-ap{color:#FCD34D}',
    '#adm-tst .at-btn{margin-top:8px;min-height:44px;width:100%;border-radius:10px;border:1px solid #334155;background:#16213A;color:#F8FAFC;font-weight:700;font-size:13px;cursor:pointer}',
    '#adm-tst .at-btn.pel{border-color:#7F1D1D;background:#2A1218;color:#FCA5A5}',
    '#adm-tst .at-btn.ok{border-color:#14532D;background:#0F2A1B;color:#86EFAC}',
    '#adm-tst .at-btn.conf{background:#B91C1C;border-color:#B91C1C;color:#fff}',
    '#adm-tst .at-msg{font-size:13px;color:#CBD5E1;padding:24px 4px;text-align:center}',
    '#adm-tst .s-activo{--c:#34D399}#adm-tst .s-flojo{--c:#FBBF24}#adm-tst .s-avisado{--c:#FB923C}#adm-tst .s-pausado{--c:#94A3B8}'
  ].join('');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hace(iso) {
    if (!iso) return null;
    var d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
    if (!isFinite(d)) return null;
    return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días';
  }
  function fecha(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }

  var DATA = null;
  function grupo(t) {
    if (t.estado === 'pausado') return 'pausado';
    if (t.estado === 'avisado') return 'avisado';
    // Para AGRUPAR se mira lo último que se sabe de él —el acceso medido o, si aún no
    // lo hay, el rastro—. El contador del aviso empieza el día que se empezó a medir,
    // así que con él todos saldrían «activos» la primera semana.
    var ref = t.last_seen_at || t.rastro_at;
    if (!ref) return 'flojo';
    return (Date.now() - Date.parse(ref)) / 86400000 >= 8 ? 'flojo' : 'activo';
  }
  var ROT = { activo: 'Activo', flojo: 'Sin entrar', avisado: 'Avisado', pausado: 'En estable' };

  function tarjeta(t) {
    var g = grupo(t), c = t.cuenta || {};
    var acc = t.last_seen_at
      ? 'Último acceso: <b>' + esc(hace(t.last_seen_at)) + '</b>'
      : 'Último acceso: <b>sin medir aún</b>' + (t.rastro_at ? ' · <span class="at-ap">rastro ' + esc(hace(t.rastro_at)) + ' (aprox.)</span>' : ' · <span class="at-ap">ningún rastro</span>');
    var act = 'Días con la app abierta (30 d): <b>' + t.dias30 + '</b> · Reportes: <b>' + t.reportes30 + '</b> en 30 d, <b>' + t.reportes + '</b> en total';
    var fut = '';
    if (t.admin) fut = 'Cuenta de administrador: no se avisa ni se pasa a estable.';
    else if (g === 'pausado') fut = 'En estable desde el ' + esc(fecha(t.beta_pausado_at)) + '. Sus datos siguen intactos.';
    else if (g === 'avisado') fut = 'Avisado el ' + esc(fecha(t.beta_aviso_at)) + (c.pausaEn != null ? ' · pasa a estable ' + (c.pausaEn === 0 ? 'en el próximo repaso' : 'en ' + c.pausaEn + ' día' + (c.pausaEn === 1 ? '' : 's')) : '') + ' si no entra.';
    else if (c.avisoEn != null) fut = c.avisoEn === 0 ? 'Recibirá el aviso en el próximo repaso.' : 'Aviso automático en ' + c.avisoEn + ' día' + (c.avisoEn === 1 ? '' : 's') + ' si no entra.';
    var btn = '';
    if (!t.admin) btn = g === 'pausado'
      ? '<button class="at-btn ok" data-a="reactivar" data-id="' + esc(t.id) + '">Reactivar en beta</button>'
      : '<button class="at-btn pel" data-a="pausar" data-id="' + esc(t.id) + '">Pasar a estable</button>';
    return '<div class="at-c s-' + g + '" data-tid="' + esc(t.id) + '">'
      + '<div class="at-n"><div class="at-nm">' + esc(t.name || t.email) + '</div><span class="at-st">' + ROT[g] + '</span></div>'
      + '<div class="at-em">' + esc(t.email) + (t.approved ? '' : ' · pendiente de aprobar') + '</div>'
      + '<div class="at-l">' + acc + '</div><div class="at-l">' + act + '</div>'
      + (fut ? '<div class="at-l">' + fut + '</div>' : '') + btn + '</div>';
  }

  function pinta() {
    var b = document.querySelector('#adm-tst .at-b'); if (!b) return;
    if (!DATA) { b.innerHTML = '<div class="at-msg">Cargando…</div>'; return; }
    if (DATA.error) { b.innerHTML = '<div class="at-msg">' + esc(DATA.error) + '</div>'; return; }
    var L = DATA.testers.slice(), R = DATA.reglas || {};
    var gr = { activo: [], flojo: [], avisado: [], pausado: [] };
    L.forEach(function (t) { gr[grupo(t)].push(t); });
    var orden = function (a, b) { return Date.parse(b.last_seen_at || b.rastro_at || 0) - Date.parse(a.last_seen_at || a.rastro_at || 0) || 0; };
    Object.keys(gr).forEach(function (k) { gr[k].sort(orden); });
    var h = '<div class="at-sum">'
      + '<div class="at-k"><div class="at-kn">' + gr.activo.length + '</div><div class="at-kl">Activos (7 d)</div></div>'
      + '<div class="at-k"><div class="at-kn">' + gr.flojo.length + '</div><div class="at-kl">Sin entrar 8+ días</div></div>'
      + '<div class="at-k"><div class="at-kn">' + gr.avisado.length + '</div><div class="at-kl">Avisados</div></div>'
      + '<div class="at-k"><div class="at-kn">' + gr.pausado.length + '</div><div class="at-kl">En estable</div></div></div>'
      + '<p class="at-regla">A los <b>' + R.avisoDias + ' días</b> sin abrir la app se le manda un email; a los <b>' + R.pausaDias
      + '</b> —y nunca antes de ' + R.minTrasAviso + ' días después del aviso— pasa a estable: deja de ser tester y su plan beta pasa a gratuito. No se borra nada y se deshace con «Reactivar». '
      + 'Los accesos se miden desde el ' + esc(fecha(R.seguimientoDesde)) + '; lo anterior es un rastro aproximado.</p>';
    [['avisado', 'Avisados'], ['flojo', 'Sin entrar'], ['activo', 'Activos'], ['pausado', 'En estable']].forEach(function (s) {
      if (!gr[s[0]].length) return;
      h += '<div class="at-sec">' + s[1] + ' · ' + gr[s[0]].length + '</div>' + gr[s[0]].map(tarjeta).join('');
    });
    if (!L.length) h += '<div class="at-msg">No hay beta testers.</div>';
    b.innerHTML = h;
  }

  function carga() {
    DATA = null; pinta();
    pide('/api/admin/testers', { headers: { 'Authorization': 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 403) throw new Error('Esta cuenta no es de administrador.');
        if (r.status === 404 || r.status === 405) throw new Error('El servidor aún no tiene el panel: llega con el próximo despliegue.');
        if (!r.ok) throw new Error('No se pudo leer la lista (' + r.status + ').');
        return r.json();
      })
      .then(function (j) { DATA = j; pinta(); }, function (e) { DATA = { error: e.message === 'sin_red' ? 'Sin conexión.' : e.message }; pinta(); });
  }

  var _conf = null;
  function accion(btn) {
    var id = btn.getAttribute('data-id'), a = btn.getAttribute('data-a');
    // Pasar a estable pide un segundo toque (confirm() no vale en una PWA).
    if (a === 'pausar' && _conf !== btn) {
      if (_conf) { _conf.classList.remove('conf'); _conf.textContent = 'Pasar a estable'; }
      _conf = btn; btn.classList.add('conf'); btn.textContent = '¿Seguro? Toca otra vez';
      setTimeout(function () { if (_conf === btn) { btn.classList.remove('conf'); btn.textContent = 'Pasar a estable'; _conf = null; } }, 3500);
      return;
    }
    _conf = null; btn.disabled = true; btn.textContent = 'Guardando…';
    pide('/api/admin/testers/' + encodeURIComponent(id) + '/' + a, { method: 'POST', headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Error ' + r.status); }); })
      .then(carga, function (e) { btn.disabled = false; btn.textContent = 'No se pudo: ' + e.message; });
  }

  function cierra() { var o = document.getElementById('adm-tst'); if (o) o.remove(); }
  window.admTestersAbrir = function () {
    if (!esAdmin()) return;
    if (!document.getElementById('adm-tst-css')) {
      var st = document.createElement('style'); st.id = 'adm-tst-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    cierra();
    var o = document.createElement('div'); o.id = 'adm-tst'; o.setAttribute('translate', 'no');
    o.innerHTML = '<div class="at-p" role="dialog" aria-label="Beta testers"><div class="at-h"><div class="at-t">Beta testers</div>'
      + '<button class="at-x" aria-label="Cerrar">✕</button></div><div class="at-b"></div></div>';
    o.addEventListener('click', function (e) {
      if (e.target === o || e.target.closest('.at-x')) return cierra();
      var b = e.target.closest('[data-a]'); if (b && !b.disabled) accion(b);
    });
    document.body.appendChild(o);
    carga();
  };
})();
